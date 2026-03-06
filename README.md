# Docs Portal (site externe)

## Démarrer

```bash
cd c:\Users\kevin\Allproject\zodback\docs-portal
bunx serve -l 5501 .
```

Ouvre ensuite `http://localhost:5501/`.

## Configuration

Édite [config.js](file:///c:/Users/kevin/Allproject/zodback/docs-portal/js/config.js) :

- `API_URL`: `http://localhost:3013/api/docs/v1/public`
- `PROJECT_ID`: l’ID du projet ZodBack
- `API_TOKEN`: optionnel (si tu veux lier le projet via token)

## Endpoints utilisés

- `GET /api/docs/v1/public/all?projectId=...`
- `GET /api/docs/v1/public/spaces?projectId=...`
- `GET /api/docs/v1/public/spaces/:slug/pages?projectId=...`
- `GET /api/docs/v1/public/pages/:slug?projectId=...`
- `GET /api/docs/v1/public/search?q=...&projectId=...`

