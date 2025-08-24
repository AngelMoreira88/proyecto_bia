# proyecto_bia/urls.py
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.auth import views as auth_views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

# Aliases “compat” (rutas antiguas del front que queremos seguir soportando)
from certificado_ldd.views import api_generar_certificado
from carga_datos.views import mostrar_datos_bia, actualizar_datos_bia

urlpatterns = [
    path('admin/', admin.site.urls),

    # JWT
    path('api/token/',         TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(),    name='token_refresh'),

    # Apps con sus prefijos oficiales
    path('api/certificado/', include(('certificado_ldd.urls', 'certificado_ldd'), namespace='certificado_ldd')),
    path('carga-datos/',      include(('carga_datos.urls', 'carga_datos'), namespace='carga_datos')),

    # ---- Aliases de compatibilidad (para que no se rompa nada viejo) ----
    # Certificados (antes llamaban a /api/generar-certificado/ o /api/generar/)
    path('api/generar-certificado/', api_generar_certificado, name='api_generar_certificado_flat'),
    path('api/generar/',             api_generar_certificado, name='api_generar_certificado_flat_legacy'),

    # Carga de datos (antes llamaban a /api/mostrar-datos-bia/)
    path('api/mostrar-datos-bia/',          mostrar_datos_bia,    name='api_mostrar_datos_bia_flat'),
    path('api/mostrar-datos-bia/<int:pk>/', actualizar_datos_bia, name='api_actualizar_datos_bia_flat'),

    # Auth
    path('accounts/login/',  auth_views.LoginView.as_view(),  name='login'),
    path('accounts/logout/', auth_views.LogoutView.as_view(), name='logout'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
