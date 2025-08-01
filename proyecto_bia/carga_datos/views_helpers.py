import pandas as pd

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
