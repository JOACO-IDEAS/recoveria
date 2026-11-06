# RecoverIA — primera prueba real con el número oficial de prueba de Meta

## Alcance

Este runbook conecta exclusivamente el número de prueba que Meta entrega con Cloud API a un entorno local, sintético y descartable. No usa el VPS comercial, bases de RecoverIA, números empresariales reales, OpenAI ni mensajes salientes implementados por RecoverIA.

El mensaje recomendado para la prueba es:

```text
Pagamos 850 mil de la factura 4567.
```

La factura ficticia persistida es `0001-00004567`, con ID `wa-test-invoice-4567`, dentro de la organización `recoveria-whatsapp-meta-test`.

## Componentes reales del repositorio

| Etapa | Implementación |
|---|---|
| Verificación de suscripción | `GET /api/whatsapp/webhook` en `src/app/api/whatsapp/webhook/route.ts` |
| Recepción | `POST /api/whatsapp/webhook` |
| Firma | `X-Hub-Signature-256`, HMAC-SHA256 sobre el cuerpo crudo con `META_APP_SECRET` |
| Tenant | `PrismaTenantPhoneRegistry`: `phone_number_id → WhatsAppBusinessNumber → organizationId` |
| Persistencia/cola | `PrismaWhatsAppIntelligenceStore.accept()` y `enqueue()` |
| Procesamiento | `npm run whatsapp:worker`; drena los trabajos disponibles y termina |
| Interpretación | `MockConversationInterpreter`, forzado por el preflight local |
| CRM | `ReadOnlyCatalogRecoveriaCrmAdapter`; reconoce la factura y persiste un evento candidato, pero las operaciones materiales siguen como propuestas sin efecto contable |
| Visualización | botón “Ver último webhook procesado” en `http://127.0.0.1:3000/whatsapp`; devuelve un snapshot sanitizado sin teléfono, nombre ni texto del remitente |

El webhook responde después de persistir y encolar. No interpreta dentro de la solicitud de Meta. Por eso una respuesta HTTP 200 del webhook prueba recepción, no procesamiento completo.

## Infraestructura mínima recomendada

```text
Meta Cloud API
  → HTTPS temporal de trycloudflare.com
  → gateway local 127.0.0.1:3101 (sólo /api/whatsapp/webhook)
  → Next.js 127.0.0.1:3000
  → PostgreSQL local / recoveria_whatsapp_test
  → worker one-shot
```

Se recomienda Cloudflare Quick Tunnel para esta única prueba: genera una URL HTTPS temporal, no requiere dominio ni cuenta y deja de existir al detener `cloudflared`. Cloudflare lo documenta expresamente para desarrollo y recepción temporal de webhooks, sin garantía de disponibilidad. No es una recomendación de producción.

El gateway del repositorio evita exponer el resto de la aplicación. `/whatsapp` se consulta únicamente desde el navegador local.

## A. Preparación de infraestructura local

### 1. Confirmar la rama

```bash
git switch codex/whatsapp-intelligence-v1-1
git status --short --branch
```

El árbol debe estar limpio antes de incorporar credenciales locales.

### 2. Crear la base descartable

Con PostgreSQL local en ejecución:

```bash
createdb recoveria_whatsapp_test
```

No reutilizar `recoveria_pilot`, `recoveria_client_zero`, staging, Neon ni ninguna base del VPS.

### 3. Crear un archivo local ignorado

Crear `.env.whatsapp-test.local` sin agregarlo a Git. Reemplazar sólo los marcadores localmente:

```dotenv
RECOVERIA_ENVIRONMENT=LOCAL
WHATSAPP_ACTIVATION_MODE=local-meta-test
WHATSAPP_ACTIVATION_ORGANIZATION_ID=recoveria-whatsapp-meta-test
WHATSAPP_ACTIVATION_INSPECTOR_ENABLED=true

DATABASE_URL=postgresql://<usuario-local>:<password-local>@127.0.0.1:5432/recoveria_whatsapp_test
RECOVERIA_DATABASE_URL=postgresql://<usuario-local>:<password-local>@127.0.0.1:5432/recoveria_whatsapp_test

WHATSAPP_CONNECTOR_ENABLED=true
WHATSAPP_INTERPRETER_PROVIDER=mock
WHATSAPP_PHONE_NUMBER_ID=<PHONE_NUMBER_ID_DE_META>
WHATSAPP_TEST_DISPLAY_PHONE=<NUMERO_DE_PRUEBA_VISIBLE_OPCIONAL>
WHATSAPP_VERIFY_TOKEN=<TOKEN_ALEATORIO_PROPIO>
META_APP_SECRET=<APP_SECRET_DE_META>
WHATSAPP_PII_KEY=<CLAVE_BASE64_DE_32_BYTES>

WHATSAPP_ACCESS_TOKEN=
OPENAI_API_KEY=
WHATSAPP_WEBHOOK_TEST_URL=http://127.0.0.1:3101/api/whatsapp/webhook
```

`WHATSAPP_ACCESS_TOKEN` no es necesario para recibir mensajes. Debe quedar vacío porque esta prueba no envía mensajes. `OPENAI_API_KEY` también queda vacío.

Generar los dos valores propios sin imprimirlos en chats ni documentación:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

El primer resultado es `WHATSAPP_VERIFY_TOKEN`; el segundo, `WHATSAPP_PII_KEY`. El verify token no lo entrega Meta: RecoverIA lo genera y luego se copia en la configuración del webhook de Meta.

### 4. Cargar el archivo y ejecutar el preflight

En cada terminal que participe:

```bash
set -a
source .env.whatsapp-test.local
set +a
npm run whatsapp:preflight-local-test
```

El resultado debe identificar únicamente:

```json
{"ok":true,"databaseHost":"127.0.0.1","databaseName":"recoveria_whatsapp_test","organizationId":"recoveria-whatsapp-meta-test","provider":"mock","connectorEnabled":true}
```

El preflight rechaza proveedor OpenAI, host remoto, nombre de base distinto, tenant distinto o URLs de migración/runtime diferentes.

### 5. Aplicar las migraciones sólo a la base local

Después del preflight exitoso:

```bash
npx prisma migrate deploy
npm run whatsapp:bootstrap-local-test
```

El bootstrap es idempotente. Crea la empresa, deudor, factura, cuenta por cobrar, caso y mapeo del `phone_number_id` ficticios. Se niega a ejecutarse fuera de `127.0.0.1/localhost` o contra otra base.

### 6. Levantar los procesos

Terminal 1 — app:

```bash
npm run dev -- -H 127.0.0.1 -p 3000
```

Terminal 2 — gateway limitado al webhook:

```bash
npm run whatsapp:webhook-gateway
```

Terminal 3 — túnel HTTPS temporal:

```bash
cloudflared tunnel --url http://127.0.0.1:3101
```

Copiar la URL `https://<aleatoria>.trycloudflare.com`. La callback completa será:

```text
https://<aleatoria>.trycloudflare.com/api/whatsapp/webhook
```

No agregar autenticación interactiva al Quick Tunnel: Meta debe poder realizar el GET de verificación y los POST firmados. La autenticidad del POST la valida RecoverIA mediante HMAC.

## B. Configuración que puede hacerse en Meta for Developers

La interfaz de Meta cambia ocasionalmente; los nombres habituales son los siguientes:

1. Entrar a [Meta for Developers](https://developers.facebook.com/apps/) con la cuenta autorizada.
2. Crear una app y elegir el caso de uso empresarial/WhatsApp que muestre la interfaz. No asociar números personales o de Christophersen como números empresariales.
3. Agregar el producto **WhatsApp** y abrir **WhatsApp → API Setup** o **Getting Started**.
4. Usar exclusivamente el **test phone number** provisto por Meta.
5. Copiar de esa pantalla, sin pegarlos en Git:
   - `Phone number ID` → `WHATSAPP_PHONE_NUMBER_ID`;
   - `WhatsApp Business Account ID` → conservar sólo para administrar la suscripción;
   - número de prueba visible → `WHATSAPP_TEST_DISPLAY_PHONE`, opcional;
   - token temporal → no es necesario para recepción y no debe configurarse en RecoverIA mientras la salida esté prohibida.
6. En **App settings → Basic**, revelar el **App Secret** y guardarlo sólo como `META_APP_SECRET` en el archivo local ignorado.
7. En **WhatsApp → Configuration** o **Webhooks**, configurar:
   - Callback URL: URL HTTPS completa del túnel;
   - Verify token: exactamente el valor local de `WHATSAPP_VERIFY_TOKEN`;
   - campo suscripto: `messages`.
8. Si la pantalla exige suscribir explícitamente la app a la WABA, hacerlo desde la configuración de Meta. La API oficial equivalente es `POST /<WABA-ID>/subscribed_apps`.
9. Si Meta requiere registrar/verificar el teléfono personal como destinatario de prueba, hacerlo sólo como **recipient/test contact**, nunca como business phone number.
10. No usar el botón de envío, Graph API ni `hello_world` durante esta prueba. Si Meta exige un mensaje empresarial saliente para habilitar la conversación, detenerse y pedir una autorización específica antes de enviarlo.

Meta documenta que Cloud API es la API oficial y requiere Business Portfolio, WABA y número empresarial. Para recibir eventos, la app debe estar suscripta a la WABA; luego sus eventos se envían al endpoint configurado. Las credenciales principales de gestión/mensajería son `whatsapp_business_management` y `whatsapp_business_messaging`.

## C. Pruebas antes del mensaje real

### 1. Verificación GET manual

Sin mostrar el token en historial compartido, abrir una shell local y ejecutar:

```bash
curl --get "$WHATSAPP_WEBHOOK_TEST_URL" \
  --data-urlencode "hub.mode=subscribe" \
  --data-urlencode "hub.verify_token=$WHATSAPP_VERIFY_TOKEN" \
  --data-urlencode "hub.challenge=recoveria-test"
```

Debe devolver `recoveria-test`.

### 2. Firma, persistencia e idempotencia sintéticas

```bash
npm run whatsapp:send-signed-fixture
npm run whatsapp:worker
WHATSAPP_EXPECT_DUPLICATE=true npm run whatsapp:verify-local-test
```

El fixture envía dos veces el mismo payload firmado. El resultado esperado es:

- ambos POST reciben HTTP 200;
- un POST previo con firma deliberadamente inválida recibe HTTP 401 y no se persiste;
- existe un solo mensaje y un solo trabajo;
- la auditoría contiene `ACCEPTED` y `DUPLICATE`;
- el trabajo termina `SUCCEEDED`;
- proveedor `mock`;
- factura `wa-test-invoice-4567`;
- evento `PAGO_TOTAL_INFORMADO`;
- acreditación y conciliación permanecen `PENDING`.

### 3. Visualización

Abrir localmente:

```text
http://127.0.0.1:3000/whatsapp
```

Pulsar **Ver último webhook procesado**. El snapshot no devuelve el teléfono, nombre ni texto del remitente.

## D. Primera prueba real entrante

1. Mantener app, gateway y túnel activos.
2. Confirmar en Meta que la verificación de callback fue exitosa y que `messages` está suscripto.
3. Desde el teléfono personal autorizado, enviar al número oficial de prueba:

   ```text
   Pagamos 850 mil de la factura 4567.
   ```

4. Confirmar en la terminal de Next.js que `POST /api/whatsapp/webhook` respondió 200. No interpretar el log como prueba suficiente.
5. Ejecutar:

   ```bash
   npm run whatsapp:worker
   npm run whatsapp:verify-local-test
   ```

6. Abrir `/whatsapp`, pulsar **Ver último webhook procesado** y verificar:
   - empresa `Empresa ficticia Meta Test`;
   - job `SUCCEEDED`;
   - proveedor `mock`;
   - intención/evento de pago informado;
   - factura `wa-test-invoice-4567`;
   - `accreditationStatus=PENDING`;
   - `reconciliationStatus=PENDING`.

El nombre del perfil del teléfono puede no coincidir con “Administración López”; eso puede agregar una advertencia de deudor no identificado. La factura se reconoce por la referencia `4567` y el evento sigue siendo conservador/revisable.

## Activación y rollback

### Checklist de activación

- [ ] Rama y árbol verificados.
- [ ] Base local `recoveria_whatsapp_test`, sin conexiones externas.
- [ ] Preflight `ok:true`.
- [ ] Migraciones aplicadas únicamente a la base local.
- [ ] Bootstrap confirma organización, factura y mapeo del `phone_number_id`.
- [ ] Proveedor `mock`; `OPENAI_API_KEY` vacío.
- [ ] Access token de Meta ausente en RecoverIA.
- [ ] Gateway publica sólo `/api/whatsapp/webhook`.
- [ ] Callback HTTPS verificada.
- [ ] Campo `messages` suscripto.
- [ ] Fixture firmado, duplicado y persistencia verificados.
- [ ] Mensaje real recibido y worker `SUCCEEDED`.
- [ ] Inspector local muestra el evento sin PII.

### Rollback inmediato

1. En Meta, desuscribir `messages` o eliminar la callback.
2. Detener `cloudflared`; la URL temporal deja de existir.
3. Detener gateway, app y cualquier worker.
4. Cambiar localmente `WHATSAPP_CONNECTOR_ENABLED=false`.
5. Conservar la base local para diagnóstico o eliminarla posteriormente mediante una decisión explícita. No ejecutar comandos de borrado como parte automática del rollback.
6. Si un secreto se expuso, rotar el App Secret en Meta, generar un verify token y una `WHATSAPP_PII_KEY` nuevos, y descartar la base cifrada anterior.

No se necesita modificar ni reiniciar el VPS comercial para activar o revertir esta prueba.

## Referencias oficiales verificadas

- [Meta — WhatsApp Business Platform official workspace](https://www.postman.com/meta/whatsapp-business-platform/overview)
- [Meta — WhatsApp Cloud API collection and setup](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api?action=share&creator=22794852)
- [Meta — Cloud API phone-number and WABA subscription examples](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=folder-c4f0f9be-ddf1-4d2b-8bdc-d97f00ae4e34)
- [Meta — Webhooks collection](https://www.postman.com/meta/whatsapp-business-platform/folder/6lt7to2/webhooks)
- [Cloudflare — Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
