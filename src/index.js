const fastify = require("fastify");
const { Pool } = require("pg");

const app = fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
  },
});

// Pool de conexao com PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Health check — retorna status do app e do banco
app.get("/health", async (request, reply) => {
  try {
    const result = await pool.query("SELECT NOW() as time, version() as version");
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      random: Math.random() + '_testk',
      database: {
        connected: true,
        time: result.rows[0].time,
        version: result.rows[0].version,
      },
    };
  } catch (err) {
    request.log.error({ err }, "Health check: falha na conexao com o banco");
    reply.status(503);
    return {
      status: "error",
      timestamp: new Date().toISOString(),
      database: { connected: false, error: err.message },
    };
  }
});

// Listar itens
app.get("/items", async (request, reply) => {
  try {
    const result = await pool.query("SELECT * FROM items ORDER BY created_at DESC LIMIT 100");
    request.log.info({ count: result.rowCount }, "Items listados");
    return { items: result.rows };
  } catch (err) {
    request.log.error({ err }, "Erro ao listar items");
    reply.status(500);
    return { error: "Erro interno" };
  }
});

// Criar item
app.post("/items", async (request, reply) => {
  const { name, description } = request.body || {};
  if (!name) {
    reply.status(400);
    return { error: "Campo 'name' e obrigatorio" };
  }

  try {
    const result = await pool.query(
      "INSERT INTO items (name, description) VALUES ($1, $2) RETURNING *",
      [name, description || null]
    );
    request.log.info({ item: result.rows[0] }, "Item criado");
    reply.status(201);
    return { item: result.rows[0] };
  } catch (err) {
    request.log.error({ err }, "Erro ao criar item");
    reply.status(500);
    return { error: "Erro interno" };
  }
});

// Buscar item por ID
app.get("/items/:id", async (request, reply) => {
  try {
    const result = await pool.query("SELECT * FROM items WHERE id = $1", [request.params.id]);
    if (result.rowCount === 0) {
      reply.status(404);
      return { error: "Item nao encontrado" };
    }
    return { item: result.rows[0] };
  } catch (err) {
    request.log.error({ err }, "Erro ao buscar item");
    reply.status(500);
    return { error: "Erro interno" };
  }
});

// Deletar item
app.delete("/items/:id", async (request, reply) => {
  try {
    const result = await pool.query("DELETE FROM items WHERE id = $1 RETURNING *", [request.params.id]);
    if (result.rowCount === 0) {
      reply.status(404);
      return { error: "Item nao encontrado" };
    }
    request.log.info({ id: request.params.id }, "Item deletado");
    return { deleted: true };
  } catch (err) {
    request.log.error({ err }, "Erro ao deletar item");
    reply.status(500);
    return { error: "Erro interno" };
  }
});

// Iniciar servidor
const start = async () => {
  try {
    // Criar tabela se nao existir
    await pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    app.log.info("Tabela 'items' verificada/criada");

    await app.listen({ port: parseInt(process.env.PORT || "3000"), host: "0.0.0.0" });
  } catch (err) {
    app.log.fatal({ err }, "Erro ao iniciar servidor");
    process.exit(1);
  }
};

start();