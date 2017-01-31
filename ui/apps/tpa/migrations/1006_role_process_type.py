# -*- coding: utf-8 -*-
# Generated by Django 1.10.4 on 2017-01-31 12:03
from __future__ import unicode_literals

from django.db import migrations
import tpa.models


class Migration(migrations.Migration):

    dependencies = [
        ('tpa', '1005_tenant_owner'),
    ]

    operations = [
        migrations.AddField(
            model_name='role',
            name='process_type',
            field=tpa.models.TextLineField(choices=[('adhoc', 'adhoc'), ('backup', 'backup'), ('barman', 'barman'), ('bdr', 'bdr'), ('control', 'control'), ('coordinator', 'coordinator'), ('datanode', 'datanode'), ('datanode-replica', 'datanode-replica'), ('gtm', 'gtm'), ('image', 'image'), ('log-server', 'log-server'), ('monitor', 'monitor'), ('openvpn-server', 'openvpn-server'), ('pgbouncer', 'pgbouncer'), ('primary', 'primary'), ('replica', 'replica'), ('witness', 'witness')], default='adhoc', max_length=255),
        ),
    ]
