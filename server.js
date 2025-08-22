require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const AIS_URL = 'wss://stream.aisstream.io/v0/stream';
const API_KEY = process.env.AISSTREAM_API_KEY;

const DEFAULT_BBOX = [[-23.95, -46.4], [-23.85, -46.2]];
const BBOX = process.env.BBOX ? JSON.parse(process.env.BBOX) : DEFAULT_BBOX;
const MESSAGE_TYPES = process.env.MESSAGE_TYPES ? JSON.parse(process.env.MESSAGE_TYPES) : ["PositionReport"];
const FILTER_MMSI = process.env.FILTER_MMSI ? JSON.parse(process.env.FILTER_MMSI) : null;

const app = express();
const server = http.createServer(app);

app.use(express.static('public'));
app.get('/health', (req, res) => res.status(200).send('OK'));

const wss = new WebSocket.Server({ server, path: '/ws' });

let aisSocket = null; let reconnectTimer = null;

function subscribePayload() {
  const base = { BoundingBoxes: [BBOX], FilterMessageTypes: MESSAGE_TYPES };
  if (FILTER_MMSI && FILTER_MMSI.length) base.FiltersShipMMSI = FILTER_MMSI;
  return [ { ...base, APIKey: API_KEY }, { ...base, Apikey: API_KEY } ];
}

function connectAIS() {
  if (!API_KEY) { console.error('⚠️ AISSTREAM_API_KEY não definida.'); return; }
  console.log('⏳ Conectando ao AISStream...');
  aisSocket = new WebSocket(AIS_URL);

  aisSocket.on('open', () => {
    console.log('✅ Conexão aberta com AISStream. Enviando inscrição...');
    const payloads = subscribePayload();
    for (const p of payloads) { try { aisSocket.send(JSON.stringify(p)); } catch (_) {} }
  });

  aisSocket.on('message', (buf) => {
    const msg = buf.toString('utf8');
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
  });

  aisSocket.on('close', () => { console.warn('⚠️ AISStream fechado. Reconnect em 3s...'); scheduleReconnect(); });
  aisSocket.on('error', (err) => { console.error('❌ Erro AISStream:', err?.message || err); try { aisSocket.close(); } catch (_) {} });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; connectAIS(); }, 3000);
}

connectAIS();

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'info', message: 'Conectado ao proxy AIS (Railway). Aguardando dados...' }));
});

server.listen(PORT, () => { console.log(`🚀 Servidor online na porta ${PORT}`); });
