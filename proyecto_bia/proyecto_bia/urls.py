# proyecto_bia/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse
from django.contrib.auth import views as auth_views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

# Vistas directas/legacy
from certificado_ldd.views import api_generar_certificado
from carga_datos.views import mostrar_datos_bia, actualizar_datos_bia, delete_db_bia

def health(_request):
    return JsonResponse({"ok": True})

urlpatterns = [
    # Admin
    path("admin/", admin.site.urls),

    # Health (para Front Door / probes)
    path("api/health/", health, name="health"),

    # JWT
    path("api/token/",         TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(),    name="token_refresh"),

    # Apps con prefijo /api/
    path("api/certificado/", include(("certificado_ldd.urls", "certificado_ldd"), namespace="certificado_ldd")),
    path("api/carga-datos/", include(("carga_datos.urls", "carga_datos"), namespace="carga_datos")),

    # Aliases legacy (si tenés front que aún los llama)
    path("api/generar-certificado/", api_generar_certificado, name="api_generar_certificado_flat"),
    path("api/generar/",             api_generar_certificado, name="api_generar_certificado_flat_legacy"),
    path("api/mostrar-datos-bia/",          mostrar_datos_bia,    name="api_mostrar_datos_bia_flat"),
    path("api/mostrar-datos-bia/<int:pk>/", actualizar_datos_bia, name="api_actualizar_datos_bia_flat"),
    path("api/db_bia/<int:pk>/",            delete_db_bia,        name="api_db_bia_delete"),

    # Auth por vistas Django (si las usás en admin)
    path("accounts/login/",  auth_views.LoginView.as_view(),  name="login"),
    path("accounts/logout/", auth_views.LogoutView.as_view(), name="logout"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

from django.http import JsonResponse
def health(_): return JsonResponse({"ok": True})
urlpatterns += [ path("api/health/", health) ]
