# Viaweb Show Cam Middleware

Middleware local para integrar eventos do Receiver Viaweb ao ISS SecurOS. O sistema recebe eventos de alarme, resolve conta/partição/zona para um sensor cadastrado, busca as câmeras vinculadas e aciona o `showcam-bridge.js` instalado dentro do SecurOS.

Este projeto não grava vídeo, não gerencia câmeras e não substitui o ISS. Ele só orquestra o fluxo Show Cam.

## Arquitetura

- `backend`: Node.js, TypeScript, Express, Prisma, PostgreSQL, Socket.IO e Axios.
- `frontend`: React, Vite e Material UI.
- `showcam-bridge.js`: dependência externa fixa, instalada como Node.js Script dentro do SecurOS. O middleware apenas chama seus endpoints HTTP.
- `ViawebReceiverClient`: cliente TCP que conecta no VIAWEB Receiver, identifica o software de monitoramento e fica recebendo eventos.

Toda comunicação externa com SecurOS passa por `IssIntegrationService`:

- REST pública do SecurOS em `ISS_BASE_URL`, com autenticação Basic.
- Bridge interno em `SHOWCAM_BRIDGE_URL`, com header `X-Bridge-Secret`.

A integração com o VIAWEB Receiver não é HTTP. Conforme o manual de integração, o software de monitoramento abre uma conexão socket TCP para o Receiver, por padrão na porta `2700`, envia a operação `ident` e permanece conectado recebendo operações `acao:"evento"`. Cada evento recebido é confirmado com `{"resp":[{"id":"..."}]}`.

## Estrutura

```text
backend/
  prisma/schema.prisma
  src/services/IssIntegrationService.ts
  src/services/EventProcessor.ts
  src/routes/
frontend/
  src/App.tsx
```

## Configuração

1. Instale as dependências:

```bash
npm install
```

2. Crie o `.env` do backend. Para produção com PostgreSQL:

```bash
cp backend/.env.example backend/.env
```

Para teste local sem PostgreSQL:

```bash
cp backend/.env.local.example backend/.env
```

3. Ajuste as variáveis:

```env
STORAGE_MODE=postgres
DATABASE_URL="postgresql://DB_USER:DB_PASSWORD@DB_HOST:5432/DB_NAME?schema=public"
PORT=3333
CORS_ORIGIN=http://localhost:5173

ISS_BASE_URL=http://127.0.0.1:8888
ISS_USERNAME=operator
ISS_PASSWORD=change-me

SHOWCAM_BRIDGE_URL=http://127.0.0.1:8090
SHOWCAM_BRIDGE_SECRET=change-me
DEFAULT_MEDIA_CLIENT_ID=MEDIA_CLIENT_1
ISS_TIMEOUT_MS=5000
MAX_CAMERAS_PER_EVENT=8

VIAWEB_RECEIVER_ENABLED=false
VIAWEB_RECEIVER_HOST=127.0.0.1
VIAWEB_RECEIVER_PORT=2700
VIAWEB_MONITOR_NAME="Viaweb Show Cam Middleware"
VIAWEB_RECEIVER_ENCRYPTION=false
VIAWEB_AES_KEY_HEX=
VIAWEB_IV_HEX=
VIAWEB_RECONNECT_MS=5000
```

4. Se estiver usando PostgreSQL, gere o Prisma Client e aplique a migração:

```bash
npm run prisma:generate
npm run prisma:migrate
```

Se estiver usando `STORAGE_MODE=memory`, pule esta etapa. Os dados ficam só em memória e somem quando o backend reinicia.

5. Rode backend e frontend em terminais separados:

```bash
npm run dev:backend
npm run dev:frontend
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:3333`

## Configuração do showcam-bridge.js no SecurOS

O arquivo `showcam-bridge.js` deve ser instalado dentro do SecurOS como objeto **Node.js Script**, no grupo **Integration and Automation** da árvore de objetos.

O bridge precisa expor:

- `POST /ping`
- `POST /show-cam`
- `POST /show-cam/layout`

Todas as chamadas devem exigir o header:

```http
X-Bridge-Secret: <SHOWCAM_BRIDGE_SECRET>
```

O middleware envia para `/show-cam`:

```json
{
  "mediaClientId": "MEDIA_CLIENT_1",
  "cameras": ["CAMERA_1", "CAMERA_2"]
}
```

E para `/show-cam/layout`:

```json
{
  "mediaClientId": "MEDIA_CLIENT_1",
  "cameras": ["CAMERA_1", "CAMERA_2"],
  "mode": "replace"
}
```

## API

### Eventos Viaweb por socket TCP

Para ligar a conexão automática com o Receiver, configure:

```env
VIAWEB_RECEIVER_ENABLED=true
VIAWEB_RECEIVER_HOST=IP_DO_RECEIVER
VIAWEB_RECEIVER_PORT=2700
VIAWEB_MONITOR_NAME="Viaweb Show Cam Middleware"
```

Para teste local no mesmo computador do Receiver, a interface web do Receiver pode liberar acesso local sem criptografia. Nesse caso:

```env
VIAWEB_RECEIVER_ENCRYPTION=false
```

Para conexão remota, a criptografia AES-256-CBC é obrigatória no Receiver. Preencha os valores em hexadecimal obtidos em **Configurações / Integração com monitoramento**:

```env
VIAWEB_RECEIVER_ENCRYPTION=true
VIAWEB_AES_KEY_HEX=...
VIAWEB_IV_HEX=...
```

O middleware usa `contaCliente`, `particao`, `zonaUsuario` e `codigoEvento` do evento recebido para resolver o sensor e disparar o Show Cam.

### Eventos Viaweb por HTTP para teste

`POST /events`

```json
{
  "account": "1234",
  "partition": "1",
  "zone": "05",
  "event_code": "E130",
  "payload": {
    "raw": "evento original do receiver"
  }
}
```

O middleware grava o evento com um dos status:

- `showcam_sent`
- `showcam_failed`
- `ignored_account_disabled`
- `ignored_sensor_not_found`
- `ignored_no_cameras`

### Cadastros

- `GET /events`
- `GET /sensors`
- `POST /sensors`
- `GET /cameras`
- `POST /cameras`
- `POST /mapping`
- `GET /dashboard`

### Teste manual

`POST /iss/show-cam/layout`

```json
{
  "mediaClientId": "MEDIA_CLIENT_1",
  "cameraIds": ["CAMERA_1"],
  "mode": "replace"
}
```

## Fluxo operacional

1. Cadastre sensores com conta, partição e zona.
2. Cadastre câmeras com o ID real do ISS.
3. Vincule um sensor a uma ou mais câmeras.
4. Ative `VIAWEB_RECEIVER_ENABLED=true` para receber eventos reais do Receiver ou envie um evento para `POST /events` em teste manual.
5. Acompanhe execução, falhas e tempo médio no dashboard.
