# Costos de CanchaYa

> **Precios referenciales** (planes públicos conocidos a noviembre de 2026). Antes de la entrega,
> confirma cada cifra en la página de precios del proveedor; cambian con frecuencia.
> Tipo de cambio usado: **1 USD = S/ 3.75** (referencial).

## 1. Costo actual: S/ 0

Todo el proyecto corre en planes gratuitos.

| Servicio | Plan | Costo | Límites principales del plan gratis | ¿Nos alcanza? |
|---|---|---|---|---|
| **Vercel** (frontend) | Hobby | $0 | ~100 GB de transferencia/mes, builds ilimitados razonables; **solo uso no comercial** | Sí (proyecto académico) |
| **Render** (backend) | Free web service | $0 | 512 MB RAM, 0.1 CPU; **se duerme tras 15 min sin tráfico** (primer request tarda ~30-60 s); 750 h/mes | Sí; UptimeRobot lo mantiene despierto |
| **Supabase** (BD, Auth, Storage, Edge Functions, cron) | Free | $0 | 500 MB de base, 1 GB de Storage, 5 GB de egress, 50 000 usuarios activos/mes, 500 000 invocaciones de Edge Functions; se **pausa tras ~7 días sin uso**; backups sin descarga automática | Sí: la base demo usa unos pocos MB (≈1 750 reservas) |
| **Stripe** (pagos) | Modo prueba | $0 | Sin cobros reales | Sí |
| **Resend** (correo) | Free | $0 | 3 000 correos/mes, 100/día; sin dominio propio solo envía al dueño de la cuenta | Sí para la demo |
| **GitHub + Actions** (CI) | Free | $0 | 2 000 min/mes en repos privados (ilimitado en públicos) | Sí: un CI completo tarda ~3-4 min |
| **UptimeRobot** (monitoreo) | Free | $0 | 50 monitores cada 5 min | Sí (1 monitor) |
| **OpenStreetMap** (mapas) | — | $0 | Uso razonable de tiles (sin API key) | Sí |
| **Total** | | **$0 / S/ 0 al mes** | | |

## 2. Si el negocio crece

### Escenario A — Lanzamiento comercial en Arequipa
~20 complejos, ~3 000 jugadores, ~5 000 reservas/mes, dominio propio.

| Servicio | Plan | USD/mes | S/ /mes | Por qué |
|---|---|---:|---:|---|
| Vercel | Pro (1 miembro) | 20 | 75 | Uso comercial permitido, más transferencia y analíticas |
| Render | Starter | 7 | 26 | Siempre encendido (sin "despertar"), 0.5 CPU |
| Supabase | Pro | 25 | 94 | 8 GB de base, 100 GB de Storage, backups diarios con 7 días de retención, sin pausa |
| Resend | Pro | 20 | 75 | 50 000 correos/mes y dominio propio (`@canchaya.pe`) |
| Dominio `.pe` | Anual prorrateado | ~4 | ~15 | ~S/ 180/año |
| UptimeRobot, GitHub | Free | 0 | 0 | |
| **Total fijo** | | **≈ 76** | **≈ 285** | |
| Pasarela de pago | Por transacción | — | — | ≈ 3,5-4,5 % + comisión fija por cobro (ver nota) |

### Escenario B — Expansión regional
~150 complejos en varias ciudades, ~30 000 jugadores, ~40 000 reservas/mes.

| Servicio | Plan | USD/mes | S/ /mes |
|---|---|---:|---:|
| Vercel | Pro (2 miembros) | 40 | 150 |
| Render | Standard (2 GB RAM) × 2 instancias | 50 | 188 |
| Supabase | Pro + cómputo Small + PITR | ~75 | ~281 |
| Resend | Pro / Scale | 20-90 | 75-338 |
| Monitoreo | UptimeRobot Solo / Pro | ~8 | ~30 |
| **Total fijo** | | **≈ 190-260** | **≈ 715-985** |

Con 2 instancias del backend habría que mover el contador del rate limit a Redis (hoy vive en memoria).

### ¿Es rentable? (escenario A)
- 5 000 reservas × S/ 100 promedio = **S/ 500 000** en reservas al mes.
- Comisión de la plataforma 10 % (configurable en el panel admin) = **S/ 50 000/mes**.
- Infraestructura ≈ **S/ 285/mes** (< 1 % de la comisión). El costo dominante es la **pasarela de pago** (~S/ 20 000/mes al 4 %), que normalmente se traslada al complejo o al jugador.

## 3. Notas importantes

- **Stripe no opera con empresas registradas en Perú.** En el proyecto se usa en **modo prueba** (acepta PEN). Para producción real en Perú se cambiaría `servicios/pagos.py` por una pasarela local (Culqi, Niubiz, Mercado Pago o Izipay), con el mismo flujo: crear sesión de pago → redirigir → verificar → webhook.
- **Modelo de costos cloud**: todos los servicios son **pago por uso / por plan**, sin servidores propios ni inversión inicial (CAPEX = 0; solo OPEX mensual). Se puede escalar subiendo de plan sin migrar.
- **Elasticidad**: Vercel (CDN) y las Edge Functions escalan solos; Render y Supabase escalan cambiando de plan o de tamaño de cómputo desde el dashboard.
- Costos ocultos a vigilar: egress de Supabase (fotos grandes), minutos de CI en repos privados, correos de recordatorio (1 por reserva).
