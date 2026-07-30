# ZodBack Docs

Portail documentaire statique de `docs.zodev.live`, inspiré des maquettes NeuralAPI et branché sur le module Documentation de ZodBack.

## Structure

- `index.html` : shell principal
- `css/style.css` : thème visuel
- `css/markdown.css` : rendu des contenus Markdown
- `js/config.js` : configuration du projet docs et du token
- `js/api.js` : client de lecture des endpoints publics
- `js/app.js` : orchestration UI, navigation, recherche et rendu
- `js/renderer.js` : rendu Markdown et ancres de titres

## Contrat API

Le portail consomme le projet `zodback-platform` via les endpoints docs publics :

- `GET /api/docs/v1/public/project/:slug`
- `GET /api/docs/v1/public/all`
- `GET /api/docs/v1/public/spaces`
- `GET /api/docs/v1/public/spaces/:spaceSlug/pages`
- `GET /api/docs/v1/public/pages/:slug`
- `GET /api/docs/v1/public/search`

## Prévisualisation locale

Servir le dossier en statique, puis ouvrir `http://127.0.0.1:5501/`.

```bash
bunx serve -l 5501 .
```

## Notes

- Le token API reste uniquement dans `js/config.js`.
- Le portail doit rester aligné sur le projet 3 (`zodback-platform`) et sur l'entité `documentation`.
