# carga_datos/views_roles.py
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models import Q, Count
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

# Permiso centralizado (solo Admin group o superuser) y el flexible
from .permissions import IsAdminOrSuperuser, IsAdminRole

# Serializers de admin de usuarios (punto 2)
from .serializers import (
    AdminUserListSerializer,
    AdminUserCreateUpdateSerializer,
)

# === Roles oficiales del PortalBIA ===
ALLOWED_ROLES = ["Admin", "Supervisor", "Operador"]


def ensure_roles_exist():
    """Crea los grupos si faltan (idempotente)."""
    for name in ALLOWED_ROLES:
        Group.objects.get_or_create(name=name)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    """
    Devuelve info del usuario actual: incluye grupos (roles).
    No requiere ser Admin; lo usa el front para mostrar/ocultar UI.
    """
    user = request.user
    groups = list(user.groups.values_list("name", flat=True))
    # si existe el flag 'must_change_password' en tu modelo de usuario, lo exponemos
    must_change_password = bool(getattr(user, "must_change_password", False))
    return Response({
        "id": user.pk,
        "username": user.get_username(),
        "email": getattr(user, "email", ""),
        "is_superuser": bool(user.is_superuser),
        "roles": groups,  # <- ya estaba
        "must_change_password": must_change_password,  # <- mejora opcional
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminOrSuperuser])
def roles_list(request):
    """
    Lista los roles válidos del sistema. Solo Admin/superuser.
    """
    ensure_roles_exist()
    return Response({"roles": ALLOWED_ROLES})


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminOrSuperuser])
def users_search(request):
    """
    Búsqueda simple por username/email/nombre/apellido. Limita a 20.
    Solo Admin/superuser.
    """
    q = (request.GET.get("q") or "").strip()
    if not q:
        return Response({"results": []})
    User = get_user_model()
    qs = User.objects.filter(
        Q(username__icontains=q) |
        Q(email__icontains=q) |
        Q(first_name__icontains=q) |
        Q(last_name__icontains=q)
    ).order_by("username")[:20]
    results = [{
        "id": u.pk,
        "username": u.get_username(),
        "email": getattr(u, "email", ""),
        "first_name": getattr(u, "first_name", ""),
        "last_name": getattr(u, "last_name", ""),
        "is_active": getattr(u, "is_active", True),
    } for u in qs]
    return Response({"results": results})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdminRole])
def users_create_or_search(request):
    """
    **GET**: igual que users_search (pero requiere IsAdminRole).
    **POST**: crea un usuario real. Payload esperado:
      {
        "username": "...", "email": "...",
        "first_name": "...", "last_name": "...",
        "password": "1234",         # numérica de 4 dígitos (validación en serializer)
        "is_active": true
      }
    Respuesta (201): shape compacto para la UI.
    """
    User = get_user_model()

    if request.method == "GET":
        q = (request.GET.get("q") or "").strip()
        if not q:
            return Response({"results": []})
        qs = User.objects.filter(
            Q(username__icontains=q) |
            Q(email__icontains=q) |
            Q(first_name__icontains=q) |
            Q(last_name__icontains=q)
        ).order_by("username")[:100]
        data = AdminUserListSerializer(qs, many=True).data
        return Response({"results": data})

    # POST → crear usuario
    ser = AdminUserCreateUpdateSerializer(data=request.data)
    if not ser.is_valid():
        return Response({"errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    user = ser.save()
    out = AdminUserListSerializer(user).data
    return Response(out, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsAdminRole])
def user_update(request, user_id: int):
    """
    Edita un usuario existente (parcial).
    - Si viene 'password', se actualiza encriptada (set_password).
    - Campos soportados: username, email, first_name, last_name, password, is_active.
    Respuesta: shape compacto para la UI.
    """
    User = get_user_model()
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({"detail": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)

    ser = AdminUserCreateUpdateSerializer(user, data=request.data, partial=True)
    if not ser.is_valid():
        return Response({"errors": ser.errors}, status=status.HTTP_400_BAD_REQUEST)
    user = ser.save()
    out = AdminUserListSerializer(user).data
    return Response(out, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminRole])
def user_deactivate(request, user_id: int):
    """
    (Opcional) Desactivar usuario: set is_active=False.
    """
    User = get_user_model()
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({"detail": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)

    user.is_active = False
    user.save(update_fields=["is_active"])
    return Response({"success": True, "id": user.pk, "is_active": user.is_active})
    

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdminOrSuperuser])
def user_roles(request, user_id: int):
    """
    GET: devuelve roles (grupos) del usuario.
    POST: reemplaza roles del usuario (solo Admin/superuser y solo usando ALLOWED_ROLES).

    Reglas de seguridad:
      - No permite quitar el rol "Admin" al ÚNICO admin existente (para evitar lockout).
      - No permite que un admin se auto-degrade (quitarse "Admin" a sí mismo).
    """
    ensure_roles_exist()
    User = get_user_model()
    try:
        target = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({"errors": ["Usuario no encontrado"]}, status=404)

    if request.method == "GET":
        roles = list(target.groups.values_list("name", flat=True))
        return Response({"roles": roles})

    # POST → set de roles
    roles = request.data.get("roles", [])
    if not isinstance(roles, list):
        return Response({"errors": ["'roles' debe ser una lista"]}, status=400)

    # Validación de catálogo
    invalid = [r for r in roles if r not in ALLOWED_ROLES]
    if invalid:
        return Response({"errors": [f"Roles inválidos: {invalid}"]}, status=400)

    # --- Salvaguardas de Admin ---
    want_admin = "Admin" in roles
    target_is_admin_now = target.groups.filter(name="Admin").exists()

    # 1) Evitar auto-degradación
    if target.pk == request.user.pk and target_is_admin_now and not want_admin:
        return Response({"errors": ["No podés quitarte el rol 'Admin' a vos mismo."]}, status=400)

    # 2) Evitar quedarse sin Admin en todo el sistema
    if target_is_admin_now and not want_admin:
        n_admins = get_user_model().objects.filter(groups__name="Admin").distinct().count()
        if n_admins <= 1:
            return Response({"errors": ["No se puede quitar 'Admin': es el único admin del sistema."]}, status=400)

    # Reemplazar solo roles de nuestro catálogo (no tocamos otros grupos ajenos)
    current_allowed = target.groups.filter(name__in=ALLOWED_ROLES)
    target.groups.remove(*current_allowed)
    for r in roles:
        g = Group.objects.get(name=r)
        target.groups.add(g)

    target.save()
    return Response({"success": True, "roles": roles})
