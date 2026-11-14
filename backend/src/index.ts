import dotenv from 'dotenv';
import { createApp } from './app.js';

dotenv.config();

const port = Number(process.env.PORT || 3001);
createApp().listen(port, () => {
  console.log(`GravityCare API and demo UI: http://localhost:${port}`);
});
