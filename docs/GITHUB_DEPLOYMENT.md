# GravityCare — Ubuntu, lancement et GitHub

Le frontend et l’API sont le même serveur : `http://localhost:3001`. Le dossier `frontend/` n’est pas utilisé.

## 1. Extraire

```bash
unzip GravityCare-Final.zip -d gravitycare
cd gravitycare
code .
```

## 2. Dépendances

```bash
cd backend
npm install
```

Node.js 20 ou plus récent.

## 3. Environnement

```bash
cp .env.example .env
```

Change `JWT_SECRET` avant tout déploiement partagé. Laisse `AI_API_KEY` vide pour rester sur le moteur de règles.

## 4. Base

```bash
npx prisma generate
npx prisma db push
npm run db:seed
```

SQLite crée `backend/prisma/dev.db`. Ce fichier ne va pas sur GitHub.

## 5. Démarrage

```bash
npm run dev
```

Ouvre http://localhost:3001. Mot de passe de démo : `demo1234`.

| Rôle | Courriel | Nom affiché |
|---|---|---|
| Astronaute | k.vance@nasa.gov | Alex |
| Astronaute | m.chen@nasa.gov | Maya |
| Astronaute | a.diallo@nasa.gov | Sam |
| Astronaute | l.tremblay@asc-csa.gc.ca | Lina |
| Médecin | flight.surgeon@nasa.gov | — |
| Sol | ground.ops@nasa.gov | — |
| Admin | admin@gravitycare.space | — |

## 6. Test

```bash
npm test
```

## 7. GitHub

Crée un dépôt vide, sans README.

```bash
cd ..
git init -b main
git add .
git commit -m "Initial GravityCare delivery"
git remote add origin https://github.com/TON_COMPTE/gravitycare.git
git push -u origin main
```

Ne commite pas `.env` ni `*.db`.

## 8. Mises à jour

```bash
git pull
cd backend && npm install && npx prisma generate && npx prisma db push
npm run dev
```
