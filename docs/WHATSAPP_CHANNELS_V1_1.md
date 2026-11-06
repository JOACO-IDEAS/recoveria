# RecoverIA WhatsApp Intelligence V1.1 — modalidades de canal

## Estado y criterio de diseño

Esta ampliación es local y sintética. No conecta servicios, no registra ni migra números, no descarga adjuntos, no envía mensajes y no modifica la base de datos. Conserva un solo intérprete y un solo adaptador CRM.

El contrato común es `recoveria.whatsapp.normalized-message.v1`. Separa explícitamente:

- `source`: canal (`PERSONAL_IMPORT`, `BUSINESS_APP_COEXISTENCE` o `CLOUD_API`) y transporte;
- `businessIdentity`: organización y cuenta/número del canal;
- `debtorIdentity`: teléfono, nombre e identificador externo del contacto;
- `content` y `attachments`;
- `conversation`: conversación, mensaje y fecha externos;
- `evidence`: registro fuente, hash y, para importaciones, autorización;
- el evento CRM, que continúa siendo creado después de interpretar el mensaje.

Los adaptadores producen ese contrato y `toIncomingWhatsAppMessage()` lo lleva al contrato V1.1 existente. `WhatsAppIntelligenceProcessor`, `ConversationInterpreter` y `RecoveriaCrmAdapter` no tienen variantes por modalidad.

## Auditoría de compatibilidad

| Modalidad | Entrada admitida | Automatización real | Conservación del número | Estado en RecoverIA |
|---|---|---|---|---|
| WhatsApp Messenger personal | Importación estructurada con autorización y evidencia | No existe sincronización de bandeja mediante la API oficial; RecoverIA no usa scraping, WhatsApp Web ni librerías no oficiales | Sólo por un flujo oficial posterior hacia Business, sujeto a lo que Meta permita para esa cuenta/número | `AuthorizedWhatsAppImportAdapter`, metadata-only, sintético |
| WhatsApp Business App | Webhook oficial después de habilitar Coexistence | Recepción por el mismo webhook de Meta; la app sigue cubriendo la operación cotidiana | Meta informa que pequeñas empresas pueden usar App y Platform simultáneamente sin cambiar el número; la elegibilidad concreta debe verificarse al incorporar cada cuenta | Mismo adaptador Meta con canal `WHATSAPP_BUSINESS_APP_COEXISTENCE` |
| WhatsApp Business Platform / Cloud API | Webhook oficial de Meta | Recepción soportada; envío futuro detrás de un puerto deshabilitado | Número empresarial registrado en WABA/Cloud API | Integración oficial V1.1 conservada y adaptada al contrato común |

El aislamiento multiempresa sigue siendo fail-closed: `phone_number_id` debe resolver a un único `organizationId`; un número no registrado produce `WHATSAPP_TENANT_NOT_FOUND`. La importación personal exige `organizationId` dentro de un sobre autorizado y validado. No se acepta identidad empresarial desde texto libre del mensaje.

## Adaptadores

### Importación autorizada

`AuthorizedWhatsAppImportAdapter` recibe un lote `recoveria.whatsapp.authorized-import.v1` con:

- referencia, responsable, fecha y alcance de la autorización;
- organización y cuenta de canal;
- identificadores externos estables para lote, conversación y mensaje;
- identidad del contacto, contenido y metadata de adjuntos.

El límite es 500 mensajes por lote, 20 adjuntos por mensaje y 24.000 caracteres por texto. El adaptador no lee rutas locales, backups, sesiones, QR, cookies ni contenido binario. Un comprobante se representa por su metadata y referencia de evidencia; su procesamiento seguro continúa bloqueado hasta contar con almacenamiento aislado, control de MIME/tamaño, antivirus o content-disarm, cifrado, retención y borrado aprobados.

El identificador interno de cada mensaje importado se deriva de organización y registro fuente. Esto evita colisiones entre empresas sin perder el identificador externo original dentro del contrato normalizado.

### Meta oficial: Cloud API y Coexistence

`normalizeMetaWebhook()` valida la forma del evento, resuelve el tenant desde `phone_number_id`, conserva el hash del cuerpo crudo y emite mensajes normalizados. Cloud API y Coexistence comparten exactamente el mismo adaptador; sólo cambia el canal declarado por el registro autorizado del número. Si el registro no lo declara, el comportamiento compatible es Cloud API.

El webhook V1.1 conserva la verificación HMAC del cuerpo crudo, desafío de suscripción, idempotencia por mensaje y procesamiento asíncrono. No se promete recuperar historia previa. Los eventos comienzan cuando la suscripción oficial está activa; cualquier historia autorizada debe ingresar por el adaptador de importación y mantener su propia procedencia.

### Envío futuro

`WhatsAppOutboundPort` define el límite futuro. `DisabledWhatsAppOutboundAdapter` siempre responde `WHATSAPP_OUTBOUND_DISABLED`. Antes de habilitar un proveedor real se requieren autorización humana, consentimiento/opt-in, reglas de ventana de conversación, plantillas aprobadas cuando correspondan, límites de calidad/frecuencia, idempotencia, auditoría y aislamiento por organización.

Meta indica que los mensajes iniciados por una empresa mediante Platform sólo pueden usar plantillas preaprobadas y aplica controles de calidad y restricciones progresivas. Fuente: [Meta — Ways to manage your business chats on WhatsApp](https://about.fb.com/news/2025/04/ways-to-manage-your-businesses-chats-on-whatsapp/).

## Restricciones y requisitos oficiales de Meta

- Cloud API es la API oficial para enviar y recibir mensajes en sistemas propios. Requiere activos empresariales como Business Portfolio, WABA y número empresarial. Las autorizaciones principales son `whatsapp_business_management` y `whatsapp_business_messaging`; `business_management` puede ser necesaria según el caso. Fuente: [Meta official WhatsApp Business Platform workspace](https://www.postman.com/meta/whatsapp-business-platform/overview) y [Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=folder-c4f0f9be-ddf1-4d2b-8bdc-d97f00ae4e34).
- El registro del número exige verificar propiedad mediante SMS o voz y configurar verificación en dos pasos; los endpoints de registro requieren un token de usuario de sistema con `whatsapp_business_messaging`. Fuente: [Meta — Registration](https://www.postman.com/meta/whatsapp-business-platform/folder/zuoeksl/registration).
- Embedded Signup es el flujo oficial para que Solution Partners, Tech Providers y Tech Partners incorporen empresas. Para publicar esa integración, Meta exige App Review y Advanced Access a `business_management` y `whatsapp_business_management`; luego deben resolverse WABA, usuarios de sistema, registro del número y suscripción de la app. Fuente: [Meta — Embedded Signup](https://www.postman.com/meta/whatsapp-business-platform/collection/du6gzjv/embedded-signup) y [Get Started](https://www.postman.com/meta/whatsapp-business-platform/folder/1bczlus/get-started).
- Meta comunicó que pequeñas empresas pueden usar WhatsApp Business App y Business Platform simultáneamente sin cambiar su número, manteniendo App para llamadas, grupos y estados y Platform para automatización/escala. Fuente: [Meta — Simultaneously using WhatsApp Business App and WhatsApp Business Platform](https://about.fb.com/news/2025/09/bringing-new-tools-to-help-businesses-boost-engagement-customer-support-and-discoverability/).

Meta no publica en las fuentes accesibles una matriz universal y estable de elegibilidad de Coexistence aplicable a toda cuenta, país y modalidad. Por eso RecoverIA no codifica una promesa. La disponibilidad, el número ofrecido, la WABA, el estado de la cuenta y las condiciones que muestre Meta deben verificarse en el Embedded Signup vigente antes de cualquier cambio real.

## Plan de migración: WhatsApp personal a Business

1. Inventariar, con autorización del titular, número, país, propietario, dispositivo, copias de seguridad, criticidad y necesidad de conservar historial.
2. Exportar sólo las conversaciones/comprobantes necesarios con consentimiento y política de retención; importarlos como evidencia separada. No convertir esa importación en una bandeja sincronizada.
3. Confirmar en los flujos oficiales vigentes de WhatsApp/Meta si el número puede registrarse en WhatsApp Business App conservándolo. No iniciar hasta contar con backup verificado y ventana de reversión.
4. Activar primero Business App mediante el proceso oficial en un número de prueba. Validar recepción manual, contactos, grupos, llamadas, historial y responsables operativos.
5. Evaluar Coexistence mediante Embedded Signup. Si Meta no ofrece elegibilidad para esa cuenta/número, conservar Business App sin automatización o usar un número empresarial separado para Platform.
6. Recién después, registrar el mapeo `phone_number_id → organizationId`, probar webhook con intérprete simulado y mantener salida deshabilitada.
7. Activar OpenAI sólo en un tenant sintético, con límites bajos y revisión humana. Ningún mensaje o comprobante acredita pagos automáticamente.

La conservación del número es un objetivo condicionado, no una garantía de RecoverIA. No se migra un número real como parte de esta versión.

## Plan de configuración de Coexistence

1. Confirmar que la empresa usa WhatsApp Business App, quién controla el número y si Meta ofrece Coexistence en su flujo actual.
2. Definir si RecoverIA actuará como Tech Provider/Solution Partner o si la empresa incorporará sus propios activos. Esto determina App Review, permisos, WABA y usuarios de sistema.
3. Preparar una app Meta separada de producción, callback HTTPS, secreto y verify token en un gestor seguro; no hacerlo en este cambio local.
4. Ejecutar Embedded Signup con un número oficial de prueba y registrar los identificadores asignados sin exponer tokens.
5. Suscribir la app a la WABA y al campo `messages`; mapear el `phone_number_id` al tenant sintético.
6. Marcar esa configuración como `WHATSAPP_BUSINESS_APP_COEXISTENCE` y ejecutar un mensaje entrante con proveedor `mock`.
7. Verificar firma, resolución de tenant, deduplicación, conversación, evidencia, evento CRM sin efecto contable y continuidad de la Business App.
8. Validar con Meta las capacidades que permanecen en la app, cualquier regla de historial, regiones y limitaciones observadas. Documentar el resultado por número.
9. Mantener `WhatsAppOutboundPort` deshabilitado. La salida requiere un proyecto separado y autorización explícita.

## Pruebas sintéticas y bloqueos

Las pruebas cubren:

- importación personal autorizada con comprobante metadata-only;
- Cloud API por webhook oficial;
- Business App Coexistence por el mismo webhook;
- rechazo de un número empresarial no registrado;
- paso de las tres modalidades por el mismo intérprete mock y el mismo CRM;
- salida futura deshabilitada.

Bloqueos exactos para la primera conexión real:

1. Identificar y auditar el backend comercial/commit desplegado; Hostinger como dominio no prueba dónde corre la aplicación.
2. Disponer de un entorno sintético público HTTPS y autorizado; no usar producción.
3. Crear/configurar activos Meta y credenciales en un gestor de secretos, con número oficial de prueba y mapeo tenant.
4. Revisar/aplicar la migración existente sólo en la base sintética autorizada; este cambio no agrega migraciones.
5. Para importación personal o Coexistence reales, persistir el canal, la autorización y el registro fuente en el backend comercial o mediante una migración aditiva aprobada. El store Prisma V1.1 heredado sólo acepta números empresariales activos y no tiene esos campos; esta ampliación no ejecutó ni creó migraciones. La primera prueba Cloud API conserva su ruta existente y no depende de este punto.
6. Proveer almacenamiento y control de seguridad antes de descargar adjuntos reales.
7. Configurar `OPENAI_API_KEY` y validar el modelo en una prueba aislada; sigue pendiente y no bloquea las pruebas mock.
8. Aprobar política de retención/borrado, observabilidad sin PII y procedimiento de rollback.
9. Mantener salida real fuera de alcance hasta un permiso específico.
