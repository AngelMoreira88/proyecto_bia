# proyecto_bia/urls.py

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.auth import views as auth_views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),

    # 1) Primero las rutas de JWT
    path('api/token/',         TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(),    name='token_refresh'),

    # # 2) Luego monta tu API de certificados bajo /api/certificado/
    # path('api/certificado/', include('certificado_ldd.urls')),

    # # 3) Tu app interna de carga
    # path('carga-datos/', include('carga_datos.urls')),
    path('api/', include('certificado_ldd.urls')),
    path('api/', include('carga_datos.urls')),

    # 4) Login/Logout
    path('accounts/login/',  auth_views.LoginView.as_view(),  name='login'),
    path('accounts/logout/', auth_views.LogoutView.as_view(), name='logout'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
