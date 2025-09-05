# carga_datos/admin.py
from django.contrib import admin
from .models import BulkJob, StagingBulkChange, AuditLog

@admin.register(BulkJob)
class BulkJobAdmin(admin.ModelAdmin):
    list_display = ('id', 'filename', 'status', 'created_by', 'created_at', 'committed_at')
    list_filter = ('status', 'created_at', 'committed_at')
    search_fields = ('id', 'filename', 'file_hash', 'created_by__username')

@admin.register(StagingBulkChange)
class StagingBulkChangeAdmin(admin.ModelAdmin):
    list_display = ('job', 'business_key', 'op', 'can_apply', 'created_at')
    list_filter = ('op', 'can_apply', 'created_at')
    search_fields = ('business_key', 'job__id')
    autocomplete_fields = ('job',)

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('table_name', 'business_key', 'field', 'action', 'actor', 'ts', 'job')
    list_filter = ('table_name', 'action', 'ts')
    search_fields = ('table_name', 'business_key', 'field', 'job__id', 'actor__username')
    autocomplete_fields = ('job', 'actor')
