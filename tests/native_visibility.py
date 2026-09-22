"""Test-only native Chromium driver: no Playwright focus/visibility emulation.
A separate headed process lets actual tab activation produce visibilitychange.
"""
import base64
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import websocket


def observe_native_replay(executable, url, out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    with tempfile.TemporaryDirectory() as tmp, (out/'native-browser.log').open('w') as log:
        args = [executable, '--no-first-run', '--no-default-browser-check',
                '--remote-debugging-port=0', '--user-data-dir='+tmp, 'about:blank']
        if hasattr(os, 'geteuid') and os.geteuid() == 0:
            args.insert(1, '--no-sandbox')  # Root-only local test containers.
        process = subprocess.Popen(args, stdout=log, stderr=log)
        ws = None
        try:
            portfile = Path(tmp)/'DevToolsActivePort'
            deadline = time.monotonic()+15
            while not portfile.exists():
                if process.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError('Native Chromium did not start; see native-browser.log')
                time.sleep(.05)
            port, endpoint = portfile.read_text().splitlines()
            ws = websocket.create_connection(f'ws://127.0.0.1:{port}{endpoint}', suppress_origin=True, timeout=15)
            sequence = 0
            def send(method, params=None, session=None):
                nonlocal sequence
                sequence += 1
                message = {'id':sequence, 'method':method, 'params':params or {}}
                if session: message['sessionId'] = session
                ws.send(json.dumps(message))
                while True:
                    result = json.loads(ws.recv())
                    if result.get('method') == 'Runtime.exceptionThrown':
                        errors.append(result['params'])
                    if result.get('id') == sequence:
                        if 'error' in result: raise RuntimeError(result['error'])
                        return result.get('result', {})
            target = next(t for t in send('Target.getTargets')['targetInfos'] if t['type']=='page')['targetId']
            session = send('Target.attachToTarget', {'targetId':target,'flatten':True})['sessionId']
            send('Runtime.enable', session=session)
            def evaluate(expression):
                value = send('Runtime.evaluate', {'expression':expression,'returnByValue':True}, session)
                if 'exceptionDetails' in value: raise RuntimeError(value['exceptionDetails'])
                return value['result'].get('value')
            def wait(expression):
                deadline = time.monotonic()+15
                while not evaluate(expression):
                    if time.monotonic() > deadline: raise RuntimeError('Native condition timed out: '+expression)
                    time.sleep(.05)
            cursor = 'Number(document.querySelector("input.tm-scrubber")?.value)'
            play = 'document.querySelector(\'button[aria-label="Play replay"]\')'
            send('Target.activateTarget', {'targetId':target})
            send('Page.navigate', {'url':url}, session)
            wait(cursor+'===39 && '+play+'!==null')
            evaluate(play+'.click()')
            wait(cursor+'>39')
            other = send('Target.createTarget', {'url':'about:blank','newWindow':False})['targetId']
            send('Target.activateTarget', {'targetId':other})
            wait('document.hidden===true')
            time.sleep(.4)
            result = {'hidden':evaluate('document.hidden'),'cursor_hidden_first':evaluate(cursor)}
            time.sleep(.9)
            result['cursor_hidden_second'] = evaluate(cursor)
            send('Target.activateTarget', {'targetId':target})
            wait('document.hidden===false')
            time.sleep(.5)
            result.update(returned_hidden=evaluate('document.hidden'), cursor_returned=evaluate(cursor),
                          paused=evaluate(play+'!==null'), cursor_resumed=None)
            if result['paused']:
                evaluate(play+'.click()')
                wait(cursor+'>'+str(result['cursor_returned']))
                result['cursor_resumed'] = evaluate(cursor)
                evaluate('document.querySelector(\'button[aria-label="Pause replay"]\').click()')
            result['page_errors'] = errors
            (out/'native-visibility.json').write_text(json.dumps(result,indent=2)+'\n')
            shot = send('Page.captureScreenshot', {'format':'png'}, session)
            (out/'native-returned.png').write_bytes(base64.b64decode(shot['data']))
            return result
        finally:
            if ws is not None: ws.close()
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait(timeout=5)
