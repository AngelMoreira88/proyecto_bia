# proyecto_bia/urls.py
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.contrib.auth import views as auth_views
from django.views.generic import TemplateView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.views.static import serve as static_serve

# Vistas directas / legacy
from certificado_ldd.views import api_generar_certificado
from carga_datos.views import mostrar_datos_bia, actualizar_datos_bia, delete_db_bia


# -------- Health & API root --------
def health(_request):
    return JsonResponse({"ok": True})


def api_root(request):
    return JsonResponse({
        "auth": {
            "token_obtain_pair": request.build_absolute_uri("/api/token/"),
            "token_refresh":     request.build_absolute_uri("/api/token/refresh/"),
        },
        "certificado": {
            "generar": request.build_absolute_uri("/api/certificado/generar/"),
        },
        "carga_datos": {
            "admin_me": request.build_absolute_uri("/api/carga-datos/admin/me"),
        },
        "health": request.build_absolute_uri("/api/health/"),
    })


urlpatterns = [
    # --- Admin ---
    path("admin/", admin.site.urls),

    # --- Health & API index ---
    path("api/", api_root, name="api-root"),
    path("api/health/", health, name="health"),

    # --- JWT Auth ---
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # --- App APIs ---
    path(
        "api/certificado/",
        include(("certificado_ldd.urls", "certificado_ldd"), namespace="certificado_ldd"),
    ),
    path(
        "api/carga-datos/",
        include(("carga_datos.urls", "carga_datos"), namespace="carga_datos"),
    ),

    # --- Aliases legacy (compatibilidad) ---
    path("api/generar-certificado/", api_generar_certificado, name="api_generar_certificado_flat"),
    path("api/generar/", api_generar_certificado, name="api_generar_certificado_flat_legacy"),
    path("api/mostrar-datos-bia/", mostrar_datos_bia, name="api_mostrar_datos_bia_flat"),
    path("api/mostrar-datos-bia/<int:pk>/", actualizar_datos_bia, name="api_actualizar_datos_bia_flat"),
    path("api/db_bia/<int:pk>/", delete_db_bia, name="api_db_bia_delete"),

    # --- Django auth views ---
    path("accounts/login/", auth_views.LoginView.as_view(), name="login"),
    path("accounts/logout/", auth_views.LogoutView.as_view(), name="logout"),
]

# --- Media solo en DEBUG ---
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

from django.views.static import serve as media_serve
if not settings.DEBUG and settings.MEDIA_ROOT:
    urlpatterns += [re_path(r"^media/(?P<path>.*)$", media_serve, {"document_root": settings.MEDIA_ROOT})]


# ====================================================================
# 🔒 CATCH-ALL: servir React SOLO si NO empieza con /api/
# ====================================================================
# Esto evita que /api/token/, /api/carga-datos/, etc.
# sean interceptados por la SPA (el problema que veías)
spa_view = TemplateView.as_view(template_name="index.html")
urlpatterns += [
    re_path(r"^(?!api/).*$", spa_view),
]

urlpatterns += [
    re_path(r"^media/(?P<path>.*)$", static_serve, {"document_root": settings.MEDIA_ROOT}),  # solo prod
]