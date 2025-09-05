# carga_datos/utils_preview.py
from django.utils.html import escape
from django.utils.safestring import mark_safe

def _render_change_cell(changes_dict):
    """
    changes_dict: { campo: { 'old': <val>, 'new': <val> }, ... }
    Devuelve HTML con listado de campos; old en rojo tachado, new en verde negrita.
    """
    if not changes_dict:
        return '<span class="text-muted">—</span>'

    parts = []
    for field, diff in changes_dict.items():
        oldv = '' if diff.get('old') is None else str(diff.get('old'))
        newv = '' if diff.get('new') is None else str(diff.get('new'))
        parts.append(
            f'''
            <div class="mb-1">
              <div><small class="text-uppercase text-secondary">{escape(field)}</small></div>
              <div>
                <span style="color:#b00020;text-decoration:line-through;">{escape(oldv)}</span>
                <span class="mx-1">→</span>
                <strong style="color:#087f23;">{escape(newv)}</strong>
              </div>
            </div>
            '''
        )
    return ''.join(parts)


def _render_errors_cell(errors_list):
    if not errors_list:
        return '<span class="text-muted">—</span>'
    items = ''.join(f'<li>{escape(str(e))}</li>' for e in errors_list)
    return f'<ul class="m-0 ps-3 text-danger">{items}</ul>'


def render_preview_table(preview_rows, *, title='Vista previa de cambios'):
    """
    preview_rows: lista de dicts con claves:
      - 'id_pago_unico' o 'business_key'
      - 'op': 'UPDATE'|'INSERT'|'DELETE'|'NOCHANGE'
      - 'errors': lista[str]
      - 'changes': dict[field] -> {'old':..., 'new':...}
    Devuelve HTML (string) seguro para insertar vía dangerouslySetInnerHTML.
    """
    styles = """
    <style>
      .pvw-card { background:#fff; border:1px solid #e1e1e1; border-radius:8px; }
      .pvw-table { width:100%; border-collapse:collapse; }
      .pvw-table th, .pvw-table td { padding:.5rem .6rem; border-bottom:1px solid #eee; vertical-align:top; }
      .pvw-table thead th { position:sticky; top:0; background:#fafafa; z-index:1; }
      .tag { display:inline-block; padding:.1rem .5rem; border-radius:999px; font-size:.75rem; font-weight:600; }
      .tag-upd { background:#e8f5e9; color:#087f23; border:1px solid #c8e6c9; }
      .tag-ins { background:#e3f2fd; color:#0d47a1; border:1px solid #bbdefb; }
      .tag-del { background:#ffebee; color:#b71c1c; border:1px solid #ffcdd2; }
      .tag-nch { background:#f5f5f5; color:#616161; border:1px solid #e0e0e0; }
      .muted { color:#777; }
    </style>
    """

    header = f"""
    <div class="pvw-card">
      <div style="padding:.8rem 1rem; border-bottom:1px solid #eee;">
        <strong>{escape(title)}</strong>
        <div class="muted"><small>Revisá los cambios detectados antes de confirmar.</small></div>
      </div>
      <div style="max-height:60vh; overflow:auto;">
        <table class="pvw-table">
          <thead>
            <tr>
              <th style="width:220px;">Clave</th>
              <th style="width:120px;">Operación</th>
              <th>Cambios</th>
              <th style="width:28%;">Errores</th>
            </tr>
          </thead>
          <tbody>
    """

    rows_html = []
    for item in (preview_rows or []):
        key = escape(str(item.get('id_pago_unico') or item.get('business_key') or ''))
        op = (item.get('op') or '').upper()
        changes = item.get('changes') or {}
        errors = item.get('errors') or []

        if op == 'UPDATE':
            tag = '<span class="tag tag-upd">UPDATE</span>'
        elif op == 'INSERT':
            tag = '<span class="tag tag-ins">INSERT</span>'
        elif op == 'DELETE':
            tag = '<span class="tag tag-del">DELETE</span>'
        else:
            tag = '<span class="tag tag-nch">NO CHANGE</span>'

        rows_html.append(f"""
          <tr>
            <td><code>{key}</code></td>
            <td>{tag}</td>
            <td>{_render_change_cell(changes)}</td>
            <td>{_render_errors_cell(errors)}</td>
          </tr>
        """)

    footer = """
          </tbody>
        </table>
      </div>
    </div>
    """

    html = styles + header + ''.join(rows_html) + footer
    return mark_safe(html)
