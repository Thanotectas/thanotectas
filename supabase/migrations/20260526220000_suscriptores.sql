-- ===========================================================================
-- Migración: suscriptores
-- Tabla para captura de email de newsletter "cápsula del día".
-- Suscripción directa (sin double opt-in). Token único para baja.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.suscriptores (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                   TEXT UNIQUE NOT NULL,
  idioma                  TEXT NOT NULL DEFAULT 'es',
  fuente                  TEXT,
  token_baja              TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  creado_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  baja_at                 TIMESTAMPTZ,
  ip_inscripcion          INET,
  ultima_capsula_enviada  UUID,
  emails_enviados         INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_suscriptores_activos
  ON public.suscriptores (creado_at)
  WHERE baja_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_suscriptores_token_baja
  ON public.suscriptores (token_baja);

-- ===========================================================================
-- RLS — nadie accede directo desde anon/authenticated.
-- Toda interacción pasa por RPC SECURITY DEFINER.
-- ===========================================================================
ALTER TABLE public.suscriptores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suscriptores_no_select ON public.suscriptores;
CREATE POLICY suscriptores_no_select ON public.suscriptores
  FOR SELECT USING (false);

DROP POLICY IF EXISTS suscriptores_no_insert ON public.suscriptores;
CREATE POLICY suscriptores_no_insert ON public.suscriptores
  FOR INSERT WITH CHECK (false);

-- ===========================================================================
-- RPC: inscribir_suscriptor
-- Inserta o reactiva una baja previa. Devuelve token_baja para mostrar en
-- el correo de bienvenida y permitir unsubscribe inmediato.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.inscribir_suscriptor(
  p_email   TEXT,
  p_idioma  TEXT DEFAULT 'es',
  p_fuente  TEXT DEFAULT NULL,
  p_ip      INET DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_existente public.suscriptores%ROWTYPE;
  v_token TEXT;
BEGIN
  IF v_email IS NULL OR v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_invalido');
  END IF;

  SELECT * INTO v_existente FROM public.suscriptores WHERE email = v_email;

  IF FOUND THEN
    IF v_existente.baja_at IS NOT NULL THEN
      UPDATE public.suscriptores
         SET baja_at = NULL,
             fuente  = COALESCE(p_fuente, fuente),
             idioma  = COALESCE(p_idioma, idioma)
       WHERE id = v_existente.id
       RETURNING token_baja INTO v_token;
      RETURN jsonb_build_object('ok', true, 'token_baja', v_token, 'reactivado', true);
    ELSE
      RETURN jsonb_build_object('ok', true, 'token_baja', v_existente.token_baja, 'ya_existia', true);
    END IF;
  END IF;

  INSERT INTO public.suscriptores (email, idioma, fuente, ip_inscripcion)
       VALUES (v_email, COALESCE(p_idioma, 'es'), p_fuente, p_ip)
   RETURNING token_baja INTO v_token;

  RETURN jsonb_build_object('ok', true, 'token_baja', v_token, 'ya_existia', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.inscribir_suscriptor(TEXT, TEXT, TEXT, INET) TO anon;
GRANT EXECUTE ON FUNCTION public.inscribir_suscriptor(TEXT, TEXT, TEXT, INET) TO authenticated;

-- ===========================================================================
-- RPC: dar_de_baja
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.dar_de_baja(p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  UPDATE public.suscriptores
     SET baja_at = NOW()
   WHERE token_baja = p_token AND baja_at IS NULL
  RETURNING email INTO v_email;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_invalido_o_ya_baja');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dar_de_baja(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.dar_de_baja(TEXT) TO authenticated;
