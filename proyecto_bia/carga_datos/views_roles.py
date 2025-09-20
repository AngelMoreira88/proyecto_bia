# carga_datos/views_roles.py
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models import Q, Count
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

# Permiso centralizado (solo Admin group o superuser)
from .permissions import IsAdminOrSuperuser

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
    Devuelve info del usuario actual: incluye grupos (roles) ya con la nueva convención.
    No requiere ser Admin; lo usa el front para mostrar/ocultar UI.
    """
    user = request.user
    groups = list(user.groups.values_list("name", flat=True))
    return Response({
        "id": user.pk,
        "username": user.get_username(),
        "email": getattr(user, "email", ""),
        "is_superuser": bool(user.is_superuser),
        "roles": groups,  # <- agregado
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
    } for u in qs]
    return Response({"results": results})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdminOrSuperuser])
def user_roles(request, user_id: int):
    """
    GET: devuelve roles (grupos) del usuario.
    POST: reemplaza roles del usuario (solo Admin/superuser y solo usando ALLOWED_ROLES).

    Reglas de seguridad:
      - No permite quitar el rol "Admin" al ÚNICO admin existente (para evitar lockout).
      - No permite que un admin se auto-degrada (quitarse "Admin" a sí mismo).
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

    # 1) Evitar auto-degradación: si estoy editando mi propio usuario y me quiero sacar "Admin"
    if target.pk == request.user.pk and target_is_admin_now and not want_admin:
        return Response({"errors": ["No podés quitarte el rol 'Admin' a vos mismo."]}, status=400)

    # 2) Evitar quedarse sin Admin en todo el sistema
    if target_is_admin_now and not want_admin:
        # ¿cuántos usuarios tienen Admin?
        n_admins = User.objects.filter(groups__name="Admin").distinct().count()
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
