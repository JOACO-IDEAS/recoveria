# RecoverIA Gestión V2 — handoff para Vercel

La navegación general conserva datos sintéticos locales. Facturas V2 usa un proxy server-side autenticado hacia el read API de RecoverIA y nunca recibe credenciales en el navegador.

La integración 6A.2 es local-only hasta que exista una frontera de sesión autenticada aprobada para producción. Sin configuración server-side, Facturas falla de forma explícita y no vuelve a los datos hardcodeados.

## Deploy al proyecto existente

```bash
pnpm install --frozen-lockfile
pnpm run build
vercel link --project recoveria-gestion
vercel --prod
```

Al ejecutar `vercel link`, seleccionar el scope correcto de Vercel y confirmar el proyecto existente `recoveria-gestion`. No crear otro proyecto.

No ejecutar estos comandos para 6A.2 sin autorización separada del founder. Antes de desplegar, configurar únicamente secretos server-side para el core URL/token y validar la frontera de autenticación descrita en `RECOVERIA-PHASE-6A-2-LIVE-PRODUCT-SURFACE.md` del core.
