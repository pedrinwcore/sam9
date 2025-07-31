  const express = require('express');
  const cors = require('cors');
  const path = require('path');
  const db = require('./config/database');
  const SSHManager = require('./config/SSHManager');


  // Importar rotas
  const authRoutes = require('./routes/auth');
  const foldersRoutes = require('./routes/folders');
  const videosRoutes = require('./routes/videos');
  const playlistsRoutes = require('./routes/playlists');
  const agendamentosRoutes = require('./routes/agendamentos');
  const comerciaisRoutes = require('./routes/comerciais');
  const downloadyoutubeRoutes = require('./routes/downloadyoutube');
  const espectadoresRoutes = require('./routes/espectadores');
  const streamingRoutes = require('./routes/streaming');
  const relayRoutes = require('./routes/relay');
  const logosRoutes = require('./routes/logos');
  const transmissionSettingsRoutes = require('./routes/transmission-settings');
  const ftpRoutes = require('./routes/ftp');
  const serversRoutes = require('./routes/servers');
 const playersRoutes = require('./routes/players');

  const app = express();
  const PORT = process.env.PORT || 3001;
  const isProduction = process.env.NODE_ENV === 'production';

  // Middlewares
  app.use(cors({
    origin: isProduction ? [
      'http://samhost.wcore.com.br',
      'https://samhost.wcore.com.br',
      'http://samhost.wcore.com.br:3000'
    ] : [
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ],
    credentials: true
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Servir arquivos estáticos do Wowza
  // Middleware personalizado para servir arquivos de vídeo
  app.use('/content', async (req, res, next) => {
    try {
      // Extrair informações do caminho
      const requestPath = req.path;
      console.log(`📹 Solicitação de vídeo: ${requestPath}`);
      
      // Verificar se é um arquivo de vídeo ou playlist
      const isVideoFile = /\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i.test(requestPath);
      const isStreamFile = /\.(m3u8|ts)$/i.test(requestPath);
      
      if (!isVideoFile && !isStreamFile) {
        console.log(`❌ Tipo de arquivo não suportado: ${requestPath}`);
        return res.status(404).json({ error: 'Arquivo não encontrado' });
      }
      
      // Configurar headers para streaming de vídeo
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range');
      res.setHeader('Accept-Ranges', 'bytes');
      
      // Definir Content-Type baseado na extensão
      if (isStreamFile && requestPath.includes('.m3u8')) {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      } else if (isStreamFile && requestPath.includes('.ts')) {
        res.setHeader('Content-Type', 'video/mp2t');
      } else if (requestPath.includes('.mp4')) {
        res.setHeader('Content-Type', 'video/mp4');
      } else if (requestPath.includes('.avi')) {
        res.setHeader('Content-Type', 'video/x-msvideo');
      } else if (requestPath.includes('.mov')) {
        res.setHeader('Content-Type', 'video/quicktime');
      } else if (requestPath.includes('.wmv')) {
        res.setHeader('Content-Type', 'video/x-ms-wmv');
      } else if (requestPath.includes('.webm')) {
        res.setHeader('Content-Type', 'video/webm');
      } else if (requestPath.includes('.mkv')) {
        res.setHeader('Content-Type', 'video/x-matroska');
      } else {
        res.setHeader('Content-Type', 'video/mp4');
      }
      
      // Cache diferente para streams vs arquivos
      if (isStreamFile) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
      
      // Para arquivos de vídeo diretos, tentar servir do sistema de arquivos local primeiro
      if (isVideoFile) {
        const fs = require('fs');
        const path = require('path');
        
        // Tentar encontrar o arquivo localmente (para desenvolvimento)
        const localPaths = [
          path.join(__dirname, '../uploads', requestPath),
          path.join(__dirname, '../content', requestPath),
          path.join('/tmp/video-uploads', path.basename(requestPath))
        ];
        
        for (const localPath of localPaths) {
          if (fs.existsSync(localPath)) {
            console.log(`📁 Servindo arquivo local: ${localPath}`);
            return res.sendFile(localPath);
          }
        }
        
        console.log(`🔍 Arquivo não encontrado localmente, tentando Wowza: ${requestPath}`);
      }
      
      // Se não encontrou localmente, tentar no Wowza
      const fetch = require('node-fetch');
      const isProduction = process.env.NODE_ENV === 'production';
      const wowzaHost = isProduction ? 'samhost.wcore.com.br' : '51.222.156.223';
      const wowzaPort = isProduction ? 1935 : 8080; // Porta HTTP do Wowza
      
      let wowzaUrl;
      if (isStreamFile) {
        // Para streams HLS/DASH
        wowzaUrl = `http://${wowzaHost}:1935${requestPath}`;
      } else {
        // Para arquivos de vídeo diretos - tentar múltiplas URLs
        const possibleUrls = [
          `http://${wowzaHost}:${wowzaPort}/content${requestPath}`,
          `http://${wowzaHost}:8086${requestPath}`,
          `http://${wowzaHost}:8080${requestPath}`,
          `http://${wowzaHost}:1935/vod/_definst_${requestPath}`,
          `http://${wowzaHost}:1935/vod${requestPath}`,
          `http://${wowzaHost}:80${requestPath}`
        ];
        
        // Tentar primeira URL
        wowzaUrl = possibleUrls[0];
      }
      
      console.log(`🔗 Redirecionando para: ${wowzaUrl}`);
      
      try {
        let wowzaResponse = null;
        
        // Para arquivos de vídeo, tentar múltiplas URLs
        if (isVideoFile) {
          const possibleUrls = [
            `http://${wowzaHost}:${wowzaPort}/content${requestPath}`,
            `http://${wowzaHost}:8086${requestPath}`,
            `http://${wowzaHost}:80${requestPath}`,
            `http://${wowzaHost}:8080${requestPath}`,
            `http://${wowzaHost}:1935/vod/_definst_${requestPath}`,
            `http://${wowzaHost}:1935/vod${requestPath}`
          ];
          
          for (const testUrl of possibleUrls) {
            try {
              console.log(`🔄 Tentando URL: ${testUrl}`);
              wowzaResponse = await fetch(testUrl, {
                method: req.method,
                headers: {
                  'Range': req.headers.range || '',
                  'User-Agent': 'Streaming-System/1.0',
                  'Accept': '*/*'
                },
                timeout: 5000 // 5 segundos timeout
              });
              
              if (wowzaResponse.ok) {
                console.log(`✅ URL funcionando: ${testUrl}`);
                break;
              } else {
                console.log(`❌ URL falhou (${wowzaResponse.status}): ${testUrl}`);
                wowzaResponse = null;
              }
            } catch (error) {
              console.log(`❌ Erro na URL: ${testUrl} - ${error.message}`);
              wowzaResponse = null;
            }
          }
        } else {
          // Para streams, usar porta 1935 diretamente
          wowzaResponse = await fetch(wowzaUrl, {
              method: req.method,
              headers: {
                'Range': req.headers.range || '',
                'User-Agent': 'Streaming-System/1.0'
              },
              timeout: 5000
            });
        }
        
        // Se ainda não funcionou, tentar SSH ou outras alternativas
        if (!wowzaResponse || !wowzaResponse.ok) {
          console.log(`❌ Todas as URLs falharam para: ${requestPath}`);
          
          return res.status(404).json({ 
            error: 'Vídeo não encontrado',
            details: 'O arquivo não foi encontrado no servidor de streaming',
            requestPath: requestPath,
            testedUrls: isVideoFile ? [
              `http://${wowzaHost}:${wowzaPort}/content${requestPath}`,
              `http://${wowzaHost}:8086${requestPath}`,
              `http://${wowzaHost}:8080${requestPath}`
            ] : [wowzaUrl]
          });
        }
        
        console.log(`✅ Servindo vídeo via Wowza: ${wowzaResponse.url || 'URL não disponível'}`);
        
        // Copiar headers da resposta do Wowza
        wowzaResponse.headers.forEach((value, key) => {
          if (!res.headersSent) {
            res.setHeader(key, value);
          }
        });
        
        // Fazer pipe do stream
        wowzaResponse.body.pipe(res);
        
      } catch (fetchError) {
        console.error('❌ Erro ao acessar Wowza:', fetchError);
        return res.status(500).json({ 
          error: 'Erro interno do servidor de streaming',
          details: fetchError.message 
        });
      }
    } catch (error) {
      console.error('❌ Erro no middleware de vídeo:', error);
      return res.status(500).json({ 
        error: 'Erro interno do servidor',
        details: error.message 
      });
    }
  });
  
  // Servir arquivos estáticos do frontend em produção
  if (isProduction) {
    app.use(express.static(path.join(__dirname, '../dist')));
    
    // Catch all handler: send back React's index.html file for SPA routing
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, '../dist/index.html'));
      }
    });
  }

  // Rotas da API
  app.use('/api/auth', authRoutes);
  app.use('/api/folders', foldersRoutes);
  app.use('/api/videos', videosRoutes);
  app.use('/api/playlists', playlistsRoutes);
  app.use('/api/agendamentos', agendamentosRoutes);
  app.use('/api/comerciais', comerciaisRoutes);
  app.use('/api/downloadyoutube', downloadyoutubeRoutes);
  app.use('/api/espectadores', espectadoresRoutes);
  app.use('/api/streaming', streamingRoutes);
  app.use('/api/relay', relayRoutes);
  app.use('/api/logos', logosRoutes);
  app.use('/api/transmission-settings', transmissionSettingsRoutes);
  app.use('/api/ftp', ftpRoutes);
  app.use('/api/servers', serversRoutes);
 app.use('/api/players', playersRoutes);

  // Rota de teste
  app.get('/api/test', (req, res) => {
    res.json({ message: 'API funcionando!', timestamp: new Date().toISOString() });
  });

  // Rota de health check
  app.get('/api/health', async (req, res) => {
    try {
      const dbConnected = await db.testConnection();
      res.json({
        status: 'ok',
        database: dbConnected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        database: 'disconnected',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Middleware de tratamento de erros
  app.use((error, req, res, next) => {
    console.error('Erro não tratado:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Arquivo muito grande' });
    }
    
    if (error.message.includes('Tipo de arquivo não suportado')) {
      return res.status(400).json({ error: 'Tipo de arquivo não suportado' });
    }
    
    res.status(500).json({ error: 'Erro interno do servidor' });
  });

  // Rota 404
  app.use('*', (req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
  });

  // Iniciar servidor
  async function startServer() {
    try {
      // Testar conexão com banco
      const dbConnected = await db.testConnection();
      
      if (!dbConnected) {
        console.error('❌ Não foi possível conectar ao banco de dados');
        process.exit(1);
      }

      app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando na porta ${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
        console.log(`🔧 API test: http://localhost:${PORT}/api/test`);
        console.log(`🔗 SSH Manager inicializado para uploads remotos`);
      });
      
      // Cleanup ao fechar aplicação
      process.on('SIGINT', () => {
        console.log('\n🔌 Fechando conexões SSH...');
        SSHManager.closeAllConnections();
        process.exit(0);
      });
      
      process.on('SIGTERM', () => {
        console.log('\n🔌 Fechando conexões SSH...');
        SSHManager.closeAllConnections();
        process.exit(0);
      });
    } catch (error) {
      console.error('❌ Erro ao iniciar servidor:', error);
      process.exit(1);
    }
  }

  startServer();