# -*- coding: utf-8 -*-
"""
Auto-healing, persistent public tunnel runner for Airtel Enterprise Portal.
"""
import subprocess
import time
import sys

SUBDOMAIN = "airtel-msme-portal"
PORT = 8000

def run_persistent_tunnel():
    print(f"[*] Starting auto-healing tunnel for port {PORT} with subdomain '{SUBDOMAIN}'...")
    while True:
        try:
            print(f"[{time.strftime('%X')}] Launching localtunnel instance...")
            proc = subprocess.Popen(
                ["cmd.exe", "/c", f"npx.cmd --yes localtunnel --port {PORT} --subdomain {SUBDOMAIN}"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )
            
            # Read stdout line by line
            for line in proc.stdout:
                line_str = line.strip()
                if line_str:
                    print(f"[{time.strftime('%X')}] {line_str}")
                    sys.stdout.flush()
            
            proc.wait()
            print(f"[{time.strftime('%X')}] Tunnel exited with code {proc.returncode}. Reconnecting in 2 seconds...")
        except Exception as e:
            print(f"[{time.strftime('%X')}] Tunnel exception: {e}. Reconnecting in 3 seconds...")
        
        time.sleep(2)

if __name__ == "__main__":
    run_persistent_tunnel()

