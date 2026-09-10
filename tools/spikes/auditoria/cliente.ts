/**
 * Cliente mínimo propio para la auditoría. No usa el adaptador del repo.
 * Habla socket.io 0.9 crudo contra la Ui24R.
 */

export const HOST = process.env.UI24R_HOST ?? '192.168.0.78';

export class Cliente {
  ws: WebSocket | null = null;
  private oyentes: ((linea: string) => void)[] = [];
  private latido: any = null;
  crudo: ((raw: string) => void) | null = null;

  async conectar(etiqueta = 'main'): Promise<void> {
    const r = await fetch(`http://${HOST}/socket.io/1/`, {
      signal: AbortSignal.timeout(3000),
    });
    const cuerpo = (await r.text()).trim();
    const sid = cuerpo.split(':')[0];
    const url = `ws://${HOST}/socket.io/1/websocket/${sid}`;
    await new Promise<void>((res, rej) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      const corte = setTimeout(() => { ws.close(); rej(new Error('timeout')); }, 4000);
      ws.onopen = () => { clearTimeout(corte); res(); };
      ws.onerror = () => { clearTimeout(corte); rej(new Error('ws error ' + etiqueta)); };
      ws.onmessage = (e) => {
        const raw = String((e as any).data);
        if (this.crudo) this.crudo(raw);
        // socket.io 0.9: "3:::<payload>" son mensajes; "1::"/"2::" son control.
        if (raw.startsWith('3:::')) {
          const payload = raw.slice(4);
          for (const linea of payload.split('\n')) {
            if (linea.length === 0) continue;
            for (const cb of this.oyentes) cb(linea);
          }
        }
      };
    });
    this.latido = setInterval(() => {
      try { this.ws?.send('3:::ALIVE'); } catch { /* noop */ }
    }, 1000);
    this.ws!.send('3:::ALIVE');
  }

  enviar(linea: string): void {
    this.ws!.send('3:::' + linea);
  }

  al(cb: (linea: string) => void): () => void {
    this.oyentes.push(cb);
    return () => { this.oyentes = this.oyentes.filter((f) => f !== cb); };
  }

  cerrar(): void {
    if (this.latido) clearInterval(this.latido);
    this.latido = null;
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
  }
}

export const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
