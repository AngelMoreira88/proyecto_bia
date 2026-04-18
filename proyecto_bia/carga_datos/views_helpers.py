import datetime
import pandas as pd


# Campos del modelo que son DateField
CAMPOS_FECHA = {'fecha_apertura', 'fecha_deuda', 'ultima_fecha_pago', 'fecha_plan'}


def limpiar_valor(valor):
    """
    Convierte valores NaN (de pandas) o cadenas vacías a None,
    y deja el resto tal cual.
    """
    try:
        if pd.isna(valor):
            return None
    except Exception:
        pass

    if isinstance(valor, str) and valor.strip() == "":
        return None

    return valor


def _parse_fecha(valor):
    """
    Convierte distintos formatos de fecha a datetime.date.
    Acepta: Timestamp, datetime, date, y strings en los formatos
    más comunes (YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD MM YYYY, etc.).
    Devuelve None si el valor está vacío o no se puede parsear.
    """
    if valor is None:
        return None

    # Pandas NaT / NaN
    try:
        if pd.isna(valor):
            return None
    except Exception:
        pass

    # Ya es date o datetime
    if isinstance(valor, datetime.datetime):
        return valor.date()
    if isinstance(valor, datetime.date):
        return valor

    # Pandas Timestamp
    if isinstance(valor, pd.Timestamp):
        return valor.date()

    # String
    if isinstance(valor, str):
        s = valor.strip()
        if not s:
            return None
        # Intentar parseo automático con dayfirst=True para formatos DD/MM o DD-MM
        try:
            return pd.to_datetime(s, dayfirst=True).date()
        except Exception:
            pass

    return None


def limpiar_payload_fechas(payload: dict) -> dict:
    """
    Aplica _parse_fecha a todos los campos de fecha del payload.
    Modifica el dict in-place y lo devuelve.
    """
    for campo in CAMPOS_FECHA:
        if campo in payload:
            payload[campo] = _parse_fecha(payload[campo])
    return payload
