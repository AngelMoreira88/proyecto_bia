# carga_datos/views_roles.py
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

ALLOWED_ROLES = ["admin", "editor", "approver"]

def ensure_roles_exist():
    for name in ALLOWED_ROLES:
        Group.objects.get_or_create(name=name)

def user_is_super_or_admin(user) -> bool:
    if not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(name="admin").exists()

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    """Devuelve info mínima del usuario actual (incluye is_superuser y grupos)."""
    user = request.user
    groups = list(user.groups.values_list("name", flat=True))
    return Response({
        "id": user.pk,
        "username": user.get_username(),
        "email": getattr(user, "email", ""),
        "is_superuser": bool(user.is_superuser),
        "groups": groups,
    })

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def roles_list(request):
    """Lista de roles permitidos (crea si faltan)."""
    if not user_is_super_or_admin(request.user):
        return Response({"errors": ["No autorizado"]}, status=403)
    ensure_roles_exist()
    return Response({"roles": ALLOWED_ROLES})

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def users_search(request):
    """Búsqueda simple por username/email/nombre/apellido. Limita a 20."""
    if not user_is_super_or_admin(request.user):
        return Response({"errors": ["No autorizado"]}, status=403)
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
@permission_classes([IsAuthenticated])
def user_roles(request, user_id: int):
    """GET: devuelve roles del usuario.
       POST: asigna (reemplaza) roles del usuario. Solo superuser/admin."""
    if not user_is_super_or_admin(request.user):
        return Response({"errors": ["No autorizado"]}, status=403)

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
    invalid = [r for r in roles if r not in ALLOWED_ROLES]
    if invalid:
        return Response({"errors": [f"Roles inválidos: {invalid}"]}, status=400)

    # Limpia roles permitidos y asigna los nuevos
    # (no toca otros grupos ajenos a ALLOWED_ROLES)
    current_allowed = target.groups.filter(name__in=ALLOWED_ROLES)
    target.groups.remove(*current_allowed)

    for r in roles:
        g = Group.objects.get(name=r)
        target.groups.add(g)

    target.save()
    return Response({"success": True, "roles": roles})
