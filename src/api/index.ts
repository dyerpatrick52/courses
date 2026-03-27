import 'dotenv/config';
import app from './app';

const PORT = Number(process.env.API_PORT) || 3000;

app.listen(PORT, () => {
  console.log(`[api] Listening on port ${PORT}`);
});
