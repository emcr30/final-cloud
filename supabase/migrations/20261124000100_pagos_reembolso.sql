-- =====================================================================
-- CanchaYa · Reembolso automático de pagos de reservas ya canceladas
-- =====================================================================
-- Caso: el jugador abre Stripe Checkout, cancela la reserva sin pagar y luego
-- vuelve a la pestaña de Stripe y paga. El backend detecta que la reserva ya
-- no estaba pendiente y devuelve el dinero (Stripe Refund).
--
-- El enum estado_pago ya tiene 'reembolsado' (migración 1); aquí solo se
-- agrega dónde guardar el id del reembolso (re_...) para poder buscarlo en
-- el panel de Stripe. El UNIQUE de pagos.stripe_session_id (migración 1)
-- garantiza un solo registro, y por tanto un solo reembolso, por sesión.
-- =====================================================================

alter table public.pagos add column if not exists stripe_refund_id text;

comment on column public.pagos.stripe_refund_id is
  'Id del reembolso en Stripe (re_...). Solo cuando estado = reembolsado.';
