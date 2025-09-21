# carga_datos/views_roles.py
from typing import List

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.paginator import Paginator
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .permissions import IsAdminRole  # si querés restringir más

User = get_user_model()

# Roles válidos (únicos)
VALID_ROLES = ("Admin", "Supervisor", "Operador")


def _normalize_role(name: str):
    if not name:
        return None
    s = str(name).strip().lower()
    if s in ("admin", "administrador"):
        return "Admin"
    if s == "supervisor":
        return "Supervisor"
    if s in ("operador", "editor", "approver"):
        return "Operador"
    return None


def _ensure_groups_exist():
    for r in VALID_ROLES:
        Group.objects.get_or_create(name=r)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    u: User = request.user
    roles = list(u.groups.values_list("name", flat=True))
    data = {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "phone": getattr(u, "phone", ""),
        "is_superuser": u.is_superuser,
        "roles": roles,
        "preferences": getattr(u, "preferences", None) or {},
    }
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])  # o [IsAdminRole]
def roles_list(request):
    _ensure_groups_exist()
    return Response({"roles": list(VALID_ROLES)})


# ======== USERS: GET (search + paginación) / POST (create) ========

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdminRole])  # restringir a Admin
def users_create_or_search(request):
    _ensure_groups_exist()

    if request.method == "GET":
        q = (request.query_params.get("q") or "").strip()
        roles_csv = (request.query_params.get("roles") or "").strip()
        page = int(request.query_params.get("page") or 1)
        page_size = int(request.query_params.get("page_size") or 10)

        qs = User.objects.all().order_by("id")

        if q and q != "__all__":
            qs = qs.filter(
                Q(username__icontains=q)
                | Q(email__icontains=q)
                | Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
            )

        if roles_csv:
            wanted = []
            for raw in roles_csv.split(","):
                n = _normalize_role(raw)
                if n:
                    wanted.append(n)
            if wanted:
                qs = qs.filter(groups__name__in=wanted).distinct()

        paginator = Paginator(qs, page_size)
        page_obj = paginator.get_page(page)

        results = []
        for u in page_obj.object_list:
            results.append(
                {
                    "id": u.id,
                    "username": u.username,
                    "email": u.email,
                    "first_name": u.first_name,
                    "last_name": u.last_name,
                    "is_active": u.is_active,
                }
            )

        return Response(
            {
                "count": paginator.count,
                "next": None,      # podés armar URLs si querés
                "previous": None,
                "results": results,
            }
        )

    # POST (crear)
    data = request.data or {}
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    username = (data.get("username") or "").strip() or email.split("@")[0]
    first_name = (data.get("first_name") or data.get("nombre") or "").strip()
    last_name = (data.get("last_name") or data.get("apellido") or "").strip()
    is_active = bool(data.get("is_active", True))

    if not email or not password:
        return Response(
            {"errors": ["Email y contraseña son requeridos"]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(email__iexact=email).exists():
        return Response(
            {"errors": ["Ya existe un usuario con ese email"]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(username__iexact=username).exists():
        return Response(
            {"errors": ["Ya existe un usuario con ese username"]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    u = User.objects.create(
        email=email,
        username=username,
        first_name=first_name,
        last_name=last_name,
        is_active=is_active,
    )
    u.set_password(password)
    u.save()

    # Rol opcional en creación
    roles_body = data.get("roles")
    role_single = data.get("role")
    assign: List[str] = []
    if isinstance(roles_body, list):
        for r in roles_body:
            n = _normalize_role(r)
            if n and n not in assign:
                assign.append(n)
    elif role_single:
        n = _normalize_role(role_single)
        if n:
            assign.append(n)

    if assign:
        u.groups.clear()
        for name in assign:
            g, _ = Group.objects.get_or_create(name=name)
            u.groups.add(g)

    return Response(
        {
            "id": u.id,
            "user": {
                "id": u.id,
                "username": u.username,
                "email": u.email,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "is_active": u.is_active,
            },
        },
        status=status.HTTP_201_CREATED,
    )


# ======== PATCH /users/<id> ========

@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsAdminRole])
def user_update(request, user_id: int):
    try:
        u = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response(
            {"detail": "Usuario no encontrado"},
            status=status.HTTP_404_NOT_FOUND,
        )

    data = request.data or {}

    email = data.get("email")
    username = data.get("username")
    first_name = data.get("first_name")
    last_name = data.get("last_name")
    is_active = data.get("is_active")
    password = data.get("password")
    # cambio de password para self también podría venir aquí con current_password/new_password

    if email is not None:
        email = email.strip()
        if email and User.objects.exclude(pk=u.pk).filter(email__iexact=email).exists():
            return Response(
                {"errors": ["Ya existe un usuario con ese email"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        u.email = email

    if username is not None:
        username = username.strip()
        if username and User.objects.exclude(pk=u.pk).filter(username__iexact=username).exists():
            return Response(
                {"errors": ["Ya existe un usuario con ese username"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        u.username = username

    if first_name is not None:
        u.first_name = first_name

    if last_name is not None:
        u.last_name = last_name

    if isinstance(is_active, bool):
        u.is_active = is_active

    if password:
        u.set_password(password)

    u.save()
    return Response(
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "is_active": u.is_active,
        }
    )


# ======== POST /users/<id>/deactivate ========

@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminRole])
def user_deactivate(request, user_id: int):
    try:
        u = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response(
            {"detail": "Usuario no encontrado"},
            status=status.HTTP_404_NOT_FOUND,
        )
    u.is_active = False
    u.save()
    return Response({"success": True})


# ======== GET/POST /users/<id>/roles ========

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsAdminRole])
def user_roles(request, user_id: int):
    _ensure_groups_exist()
    try:
        u = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response(
            {"detail": "Usuario no encontrado"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        roles = list(u.groups.values_list("name", flat=True))
        return Response({"roles": roles})

    # POST → set roles
    roles = request.data.get("roles") or []
    if not isinstance(roles, list):
        return Response(
            {"errors": ["'roles' debe ser una lista"]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    wanted = []
    for r in roles:
        n = _normalize_role(r)
        if n and n not in wanted:
            wanted.append(n)

    u.groups.clear()
    for name in wanted:
        g, _ = Group.objects.get_or_create(name=name)
        u.groups.add(g)

    return Response(
        {"success": True, "roles": list(u.groups.values_list("name", flat=True))}
    )
