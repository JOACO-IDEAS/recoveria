# RecoverIA WhatsApp Intelligence V1

> V1.1 preserves this implementation and adds an infrastructure-neutral CRM adapter for the separately operated commercial backend. See `docs/WHATSAPP_INTELLIGENCE_V1_1.md`.

## Estado y límites

Esta primera versión es funcional en `LOCAL` con datos sintéticos. No fue desplegada, no se conectó a Meta, no llamó a OpenAI y no ejecutó migraciones. La migración `20261104190000_whatsapp_intelligence_v1` es aditiva y queda preparada para revisión; aplicarla a cualquier base compartida requiere autorización explícita.

WhatsApp aporta evidencia conversacional, no verdad contable. El módulo crea `WhatsAppCrmCandidateEvent` con `accreditationStatus=PENDING` y `reconciliationStatus=PENDING`. Nunca agrega `ReceivableLedgerEntry`, reduce deuda, confirma un pago, acredita fondos ni concilia. La promoción a los eventos materiales existentes exige la decisión humana que ya impone `collections-engine/event-ledger.ts`.

## Auditoría inicial

- Arquitectura: monolito modular Next.js 16 App Router + TypeScript. UI y Route Handlers viven en `src/app`; capacidades verticales viven en `src/modules`.
- Frontend: la superficie principal está en `src/app` y `src/components`. Existe además `apps/web`, una BFF/UI separada para staging sintético en Vercel.
- Backend: Route Handlers del mismo Next.js actúan como Product API. Los trabajos existentes usan límites asíncronos y procesos `tsx` separados.
- Base: PostgreSQL mediante Prisma. Todas las entidades tenant-owned incluyen `organizationId`.
- Entidades reutilizadas: `Organization`, `Membership`, `Party`, `Invoice`, `Receivable`, `ReceivableLedgerEntry`, `CollectionCase`, `CollectionEvent`, `PromiseToPay`, `ReviewTask`, `Contact` y `ContactPoint`. `collection-interactions` ya modela `PaymentClaim`, `CanonicalPromise` e `InvoiceDispute`.
- Autenticación actual: staging founder-only mediante identidad Google, sesión cifrada, CSRF y membership server-side. Los webhooks externos no usan sesión humana: se autentican con `X-Hub-Signature-256`, y el tenant se deriva del `phone_number_id` persistido, nunca del cuerpo del cliente.
- Despliegue encontrado: la documentación vigente prueba Vercel → BFF → WIF → Product API Cloud Run → Cloud Tasks → worker Cloud Run → Neon. El repositorio no contiene evidencia operativa de Hostinger y declara que producción todavía no existe. Antes de integrar allí hay que confirmar soporte Node.js, HTTPS público, variables secretas y un worker/cron durable.
- IA previa: no había proveedor LLM conectado. Existía un `DeterministicTemplateDraftProvider` para borradores conservadores. WhatsApp conserva ese patrón con `MockConversationInterpreter` y un adaptador independiente `OpenAIConversationInterpreter`.

## Flujo implementado

1. `GET /api/whatsapp/webhook` valida `hub.mode`, `hub.verify_token` y devuelve `hub.challenge`.
2. `POST /api/whatsapp/webhook` lee el cuerpo crudo una sola vez y verifica HMAC-SHA256 con `META_APP_SECRET`.
3. El parser acepta texto y metadatos mínimos de imagen/documento. No descarga adjuntos ni los escribe en logs.
4. `phone_number_id` resuelve un `WhatsAppBusinessNumber` activo y, por relación, el tenant.
5. `metaMessageId` único hace idempotente la recepción. El mensaje, conversación y PII se guardan tenant-scoped; teléfono, nombre, texto y nombre de archivo se cifran con `WHATSAPP_PII_KEY`.
6. El webhook sólo persiste y encola. `npm run whatsapp:worker` reclama trabajos, carga hasta `WHATSAPP_MAX_CONTEXT_MESSAGES`, interpreta, enlaza candidatos CRM y persiste el resultado.
7. Los errores transitorios usan backoff exponencial hasta cinco intentos. Sólo se guardan códigos seguros, nunca contenido, tokens ni secretos.
8. La retención se configura por número empresarial (`retentionDays`, 90 por defecto) mediante `purgeAfter`. El proceso de purga no está habilitado en V1: requiere una política de eliminación autorizada.

## Simulador

Ejecutar `npm run dev` y abrir `/whatsapp`. También se puede invocar `POST /api/whatsapp/simulator`. La ruta sólo está disponible cuando `RECOVERIA_ENVIRONMENT` está ausente o vale `LOCAL`.

Incluye pago total, pago parcial, promesa, incumplimiento, comprobante duplicado, factura no identificada, dos facturas similares, disputa, conversación de varios mensajes y webhook reenviado. Muestra mensaje original, JSON interpretado, evento candidato, factura/caso, estados finales y advertencias.

## OpenAI: activación y costo

La recomendación de menor costo para esta clasificación es `gpt-6-luna` con `reasoning.effort=none`: la documentación oficial vigente lo presenta como el modelo eficiente para tareas enfocadas y de alto volumen, a USD 0,10 por millón de tokens de entrada y USD 0,50 por millón de salida. Antes de la primera prueba real, volver a verificar precios y disponibilidad en:

- https://developers.openai.com/api/docs/models
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/reference/resources/responses/methods/create

La integración usa Responses API con Structured Outputs (`json_schema`, `strict=true`) y vuelve a validar la respuesta con Zod. Registra `input_tokens`, `output_tokens`, total, latencia y costo estimado. Los precios no están ocultos en código: se cargan desde variables para que el cálculo sea auditable.

Para la primera prueba real:

1. Crear una clave restringida en OpenAI Platform dentro del proyecto correspondiente.
2. Guardarla sólo en el gestor de secretos del entorno o en un `.env.local` ignorado: `OPENAI_API_KEY=...`. No pegarla en GitHub, logs, documentación ni variables `NEXT_PUBLIC_*`.
3. Configurar `WHATSAPP_INTERPRETER_PROVIDER=openai`, `OPENAI_WHATSAPP_MODEL=gpt-6-luna`, `OPENAI_WHATSAPP_REASONING_EFFORT=none`, precios actuales y límites.
4. Empezar con un tenant sintético, un límite mensual bajo y revisar manualmente el truth set antes de habilitar tráfico real.

## Meta Cloud API: número oficial de prueba

1. En Meta for Developers, crear o seleccionar una app de tipo Business y agregar el producto WhatsApp.
2. En WhatsApp > API Setup, usar el número de prueba oficial, registrar un destinatario de prueba y copiar de forma segura el temporary access token, `Phone number ID` y `WhatsApp Business Account ID`.
3. En App settings > Basic, obtener el App Secret y guardarlo como `META_APP_SECRET` en el gestor de secretos.
4. Generar localmente un token aleatorio largo para `WHATSAPP_VERIFY_TOKEN`; el mismo valor se configura al registrar el webhook. No es el access token.
5. Publicar por HTTPS la callback `https://<dominio>/api/whatsapp/webhook`, registrar el verify token y suscribir el campo `messages`.
6. Crear un `WhatsAppBusinessNumber` que relacione el `WHATSAPP_PHONE_NUMBER_ID` con el `organizationId` correcto. No aceptar el tenant desde parámetros del webhook.
7. Mantener `WHATSAPP_CONNECTOR_ENABLED=false` hasta que firma, aislamiento, migración, worker y retención hayan sido revisados. Luego habilitar primero con `WHATSAPP_INTERPRETER_PROVIDER=mock`.
8. Para enviar el template oficial de prueba, usar Graph API `/<GRAPH_API_VERSION>/<PHONE_NUMBER_ID>/messages` con el token temporal y el template `hello_world`. V1 no implementa envío saliente; este paso sólo valida el número oficial en Meta.

Referencias oficiales de Meta (el sitio devolvió rate limit durante esta auditoría):

- https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-whatsapp

## Variables

Obligatorias para webhook real: `RECOVERIA_DATABASE_URL`, `WHATSAPP_CONNECTOR_ENABLED`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, `WHATSAPP_PII_KEY` (32 bytes aleatorios codificados en base64). `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` quedan preparados para Meta y bootstrap; la recepción no requiere enviar el access token a RecoverIA.

Obligatorias al activar OpenAI: `OPENAI_API_KEY`, `OPENAI_WHATSAPP_MODEL`, `OPENAI_WHATSAPP_REASONING_EFFORT`, `OPENAI_INPUT_USD_MICROS_PER_MILLION_TOKENS`, `OPENAI_OUTPUT_USD_MICROS_PER_MILLION_TOKENS`.

Límites: `WHATSAPP_MAX_INPUT_CHARACTERS`, `WHATSAPP_MAX_CONTEXT_MESSAGES`, `WHATSAPP_MAX_OUTPUT_TOKENS`, `WHATSAPP_MONTHLY_TOKEN_LIMIT`, `WHATSAPP_MONTHLY_COST_USD_MICROS_LIMIT`.

## Pendientes para conexión externa

- Confirmar la topología real de Hostinger y cómo ejecutar el worker durable.
- Autorizar y aplicar la migración aditiva en un entorno sintético aislado.
- Crear de forma controlada el primer `WhatsAppBusinessNumber`; no hay endpoint público de autoaprovisionamiento.
- Definir y autorizar el job de purga según la política legal de retención.
- Configurar Meta y OpenAI en gestores de secretos.
- Ejecutar evals con mensajes etiquetados; si `gpt-6-luna` no alcanza precisión, comparar contra el siguiente tier sin cambiar el contrato.
