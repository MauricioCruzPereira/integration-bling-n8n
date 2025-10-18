# Importador de Produtos - Telegram Bot + N8N + Bling

Sistema automatizado para importar produtos via Telegram para o Bling usando N8N.

## 🚀 Setup Rápido

### 1. Clonar Repositório
```bash
git clone https://github.com/seu-usuario/seu-repo.git
cd seu-repo
```

### 2. Configurar Variáveis de Ambiente
```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar com seus valores reais
nano .env
```

### 3. Iniciar com Docker
```bash
# Build e start
docker compose up -d

# Ver logs
docker compose logs -f
```

### 4. Configurar N8N

1. Acesse: http://localhost:5678
2. Crie conta owner
3. Importe workflow de `n8n/workflow-backup.json`
4. Configure credenciais do Supabase
5. Ative o workflow

### 5. Testar Bot

No Telegram, envie `/start` para seu bot.

## 📋 Requisitos

- Docker 20.10+
- Docker Compose 2.0+
- Conta no Telegram (BotFather)
- Conta no Supabase
- Conta no Bling (opcional)

## 🔧 Estrutura
```
.
├── bot/                  # Bot do Telegram
├── n8n/                  # Workflows N8N
├── .env                  # Variáveis (não commitado)
├── docker-compose.yml    # Orquestração
└── chatbot-telegram.js   # Código principal do bot
```

## 📝 Licença

MIT