// ============================================================
// GOOGLE AUTH - THANOTECTAS
// Integración de Login con Google para Thanotectas
// Archivo: google-auth-thanotectas.js
// ============================================================
// 
// INSTRUCCIONES DE INTEGRACIÓN:
// 
// 1. Agregar este archivo al proyecto:
//    <script src="google-auth-thanotectas.js"></script>
//    (después del script de Supabase y después de inicializar supabaseClient)
//
// 2. En cada página con login (oraculo.html, panel.html, cuenta.html),
//    agregar el botón de Google donde están los otros botones de login:
//
//    <button id="btn-google-login" class="btn-google" onclick="loginConGoogle()">
//      <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
//        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
//        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
//        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
//        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
//      </svg>
//      Continuar con Google
//    </button>
//
// 3. Agregar los estilos CSS (incluidos abajo)
//
// ============================================================

/**
 * Inicia el flujo de login con Google vía Supabase OAuth
 * Redirige al usuario a la pantalla de consentimiento de Google
 * y luego de vuelta a oraculo.html
 */
async function loginConGoogle() {
  const btnGoogle = document.getElementById('btn-google-login');
  
  try {
    // Deshabilitar botón mientras carga
    if (btnGoogle) {
      btnGoogle.disabled = true;
      btnGoogle.innerHTML = `
        <span class="spinner-google"></span>
        Conectando con Google...
      `;
    }

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://thanotectas.com/oraculo.html',
        queryParams: {
          // Solicitar acceso al perfil y email
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });

    if (error) {
      console.error('Error en login con Google:', error.message);
      mostrarErrorGoogle('No se pudo conectar con Google. Intenta de nuevo.');
      restaurarBotonGoogle(btnGoogle);
    }
    // Si no hay error, el navegador redirige a Google automáticamente

  } catch (err) {
    console.error('Error inesperado:', err);
    mostrarErrorGoogle('Error inesperado. Intenta de nuevo.');
    restaurarBotonGoogle(btnGoogle);
  }
}


/**
 * Maneja el callback después de que Google redirige de vuelta.
 * Llamar esta función al cargar oraculo.html para capturar la sesión.
 * 
 * Uso: agregar al DOMContentLoaded o al onload de oraculo.html:
 *   manejarCallbackGoogle();
 */
async function manejarCallbackGoogle() {
  // Verificar si venimos de un redirect de OAuth (hay hash con access_token)
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const accessToken = hashParams.get('access_token');
  
  if (accessToken) {
    try {
      // Obtener sesión actual (Supabase la establece automáticamente del hash)
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      
      if (error) {
        console.error('Error obteniendo sesión de Google:', error.message);
        return;
      }

      if (session && session.user) {
        const user = session.user;
        console.log('Login con Google exitoso:', user.email);

        // Verificar si es usuario nuevo y crear perfil en la tabla de usuarios
        await crearOActualizarPerfilGoogle(user);

        // Limpiar el hash de la URL para que no se vea el token
        window.history.replaceState(null, '', window.location.pathname);

        // Continuar con el flujo normal de la app
        // (tu función existente que carga el oráculo después del login)
        if (typeof onLoginExitoso === 'function') {
          onLoginExitoso(user);
        }
      }
    } catch (err) {
      console.error('Error procesando callback de Google:', err);
    }
  }
}


/**
 * Crea o actualiza el perfil del usuario en la tabla de usuarios de Supabase
 * cuando se autentica por primera vez con Google.
 * 
 * Adaptar los nombres de columnas según tu tabla actual.
 */
async function crearOActualizarPerfilGoogle(user) {
  const metadata = user.user_metadata || {};
  
  try {
    // Verificar si el usuario ya existe en la tabla de perfiles
    const { data: perfilExistente, error: errorBuscar } = await supabaseClient
      .from('usuarios')  // <-- Ajustar al nombre real de tu tabla
      .select('id')
      .eq('id', user.id)
      .single();

    if (errorBuscar && errorBuscar.code === 'PGRST116') {
      // Usuario no existe, crear perfil nuevo
      const { error: errorCrear } = await supabaseClient
        .from('usuarios')  // <-- Ajustar al nombre real de tu tabla
        .insert({
          id: user.id,
          email: user.email,
          nombre: metadata.full_name || metadata.name || '',
          avatar_url: metadata.avatar_url || metadata.picture || '',
          plan: 'gratis',
          creditos: 3,
          es_admin: false,
          proveedor: 'google',
          creado_en: new Date().toISOString()
        });

      if (errorCrear) {
        console.error('Error creando perfil de Google:', errorCrear.message);
      } else {
        console.log('Perfil de Google creado exitosamente');
      }
    } else if (perfilExistente) {
      // Usuario existe, actualizar avatar y nombre si vienen de Google
      const { error: errorActualizar } = await supabaseClient
        .from('usuarios')  // <-- Ajustar al nombre real de tu tabla
        .update({
          nombre: metadata.full_name || metadata.name || undefined,
          avatar_url: metadata.avatar_url || metadata.picture || undefined,
          proveedor: 'google'
        })
        .eq('id', user.id);

      if (errorActualizar) {
        console.error('Error actualizando perfil:', errorActualizar.message);
      }
    }
  } catch (err) {
    console.error('Error en crearOActualizarPerfilGoogle:', err);
  }
}


/**
 * Muestra mensaje de error en la interfaz
 */
function mostrarErrorGoogle(mensaje) {
  // Buscar contenedor de errores existente o crear uno
  let errorDiv = document.getElementById('google-auth-error');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.id = 'google-auth-error';
    errorDiv.className = 'google-auth-error';
    const btnGoogle = document.getElementById('btn-google-login');
    if (btnGoogle && btnGoogle.parentNode) {
      btnGoogle.parentNode.insertBefore(errorDiv, btnGoogle.nextSibling);
    }
  }
  errorDiv.textContent = mensaje;
  errorDiv.style.display = 'block';

  // Ocultar después de 5 segundos
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}


/**
 * Restaura el botón de Google a su estado original
 */
function restaurarBotonGoogle(btn) {
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `
      <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
      Continuar con Google
    `;
  }
}


// ============================================================
// AUTO-INICIALIZACIÓN
// Al cargar la página, verificar si venimos de un callback de Google
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Solo ejecutar en oraculo.html (la página de redirect)
  if (window.location.pathname.includes('oraculo')) {
    manejarCallbackGoogle();
  }
});
