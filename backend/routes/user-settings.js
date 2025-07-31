const express = require('express');
const db = require('../config/database');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

// GET /api/user-settings - Buscar configurações do usuário
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Buscar configurações personalizadas do usuário
    const [rows] = await db.execute(
      `SELECT 
        configuracoes_menu,
        sidebar_collapsed,
        notifications_enabled,
        auto_refresh,
        refresh_interval,
        language,
        timezone
       FROM user_settings 
       WHERE user_id = ?`,
      [userId]
    );

    if (rows.length > 0) {
      const settings = rows[0];
      let menuItems = null;
      
      try {
        menuItems = settings.configuracoes_menu ? JSON.parse(settings.configuracoes_menu) : null;
      } catch (error) {
        console.error('Erro ao parsear configurações do menu:', error);
      }

      res.json({
        menu_items: menuItems,
        sidebar_collapsed: settings.sidebar_collapsed === 1,
        notifications_enabled: settings.notifications_enabled === 1,
        auto_refresh: settings.auto_refresh === 1,
        refresh_interval: settings.refresh_interval || 30,
        language: settings.language || 'pt-BR',
        timezone: settings.timezone || 'America/Sao_Paulo'
      });
    } else {
      // Retornar configurações padrão
      res.json({
        menu_items: null,
        sidebar_collapsed: false,
        notifications_enabled: true,
        auto_refresh: true,
        refresh_interval: 30,
        language: 'pt-BR',
        timezone: 'America/Sao_Paulo'
      });
    }
  } catch (error) {
    console.error('Erro ao buscar configurações do usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/user-settings - Salvar configurações do usuário
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      menu_items,
      sidebar_collapsed,
      notifications_enabled,
      auto_refresh,
      refresh_interval,
      language,
      timezone
    } = req.body;

    // Verificar se já existe configuração para o usuário
    const [existingRows] = await db.execute(
      'SELECT user_id FROM user_settings WHERE user_id = ?',
      [userId]
    );

    const menuItemsJson = menu_items ? JSON.stringify(menu_items) : null;

    if (existingRows.length > 0) {
      // Atualizar configurações existentes
      await db.execute(
        `UPDATE user_settings SET 
         configuracoes_menu = ?,
         sidebar_collapsed = ?,
         notifications_enabled = ?,
         auto_refresh = ?,
         refresh_interval = ?,
         language = ?,
         timezone = ?,
         updated_at = NOW()
         WHERE user_id = ?`,
        [
          menuItemsJson,
          sidebar_collapsed ? 1 : 0,
          notifications_enabled ? 1 : 0,
          auto_refresh ? 1 : 0,
          refresh_interval || 30,
          language || 'pt-BR',
          timezone || 'America/Sao_Paulo',
          userId
        ]
      );
    } else {
      // Criar novas configurações
      await db.execute(
        `INSERT INTO user_settings (
          user_id, configuracoes_menu, sidebar_collapsed, notifications_enabled,
          auto_refresh, refresh_interval, language, timezone, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          userId,
          menuItemsJson,
          sidebar_collapsed ? 1 : 0,
          notifications_enabled ? 1 : 0,
          auto_refresh ? 1 : 0,
          refresh_interval || 30,
          language || 'pt-BR',
          timezone || 'America/Sao_Paulo'
        ]
      );
    }

    res.json({ success: true, message: 'Configurações salvas com sucesso' });
  } catch (error) {
    console.error('Erro ao salvar configurações do usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;