#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# © Copyright EnterpriseDB UK Limited 2015-2022 - All rights reserved.

from .bdr_always_on import BDR_Always_ON

import sys
import itertools


class BDR_Autoscale(BDR_Always_ON):
    def add_architecture_options(self, p, g):
        g.add_argument(
            "--num-shard-groups",
            type=int,
            metavar="N",
            help="number of BDR shard groups required",
            dest="num_shard_groups",
            default=2,
        )
        g.add_argument(
            "--instances-per-shard",
            type=int,
            metavar="N",
            help="number of BDR instances per shard group",
            dest="instances_per_shard",
            default=3,
        )
        super().add_architecture_options(p, g)

    def update_argument_defaults(self, defaults):
        super().update_argument_defaults(defaults)
        defaults.update(
            {
                "postgres_version": 11,
                "tpa_2q_repositories": [
                    "products/2ndqpostgres/release",
                ],
            }
        )

    # We have num_shard_groups*instances_per_shard instances.
    #
    # The first_bdr_primary will create a top-level BDR node group and one child
    # group per shard. One instance per shard will join the top-level group, and
    # the remaining instances in the shard will join that shard's child group.

    def num_instances(self):
        return self.args["num_shard_groups"] * self.args["instances_per_shard"]

    # We enumerate the BDR primary instances in our cluster that will
    # participate in sharding.

    def _bdr_primaries(self):
        primaries = []
        for i in self.args["instances"]:
            r = i.get("role")
            if (
                "bdr" in r
                and "primary" in r
                and "readonly" not in r
                and "subscriber-only" not in r
            ):
                primaries.append(i.get("node"))
        return primaries

    def update_cluster_vars(self, cluster_vars):
        super().update_cluster_vars(cluster_vars)

        extensions = cluster_vars.get("bdr_extensions", [])
        extensions.append("btree_gist")
        extensions.append("postgres_fdw")
        extensions.append("bdr")
        extensions.append("autoscale")

        packages = cluster_vars.get("extra_postgres_packages", {})
        packages.update(
            {
                "Debian": [
                    "postgresql-11-autoscale-plugin",
                    "postgresql-11-autoscale-plugin-dbg",
                ],
                "RedHat": [
                    "postgresql11-autoscale",
                ],
                "Ubuntu": [
                    "postgresql-11-autoscale-plugin",
                    "postgresql-11-autoscale-plugin-dbg",
                ],
            }
        )

        top = self.args["bdr_node_group"]
        bdr_node_groups = [{"name": top}]
        for i in range(1, self.args["num_shard_groups"] + 1):
            bdr_node_groups.append(
                {
                    "name": "shard_group_%s" % i,
                    "node_group_type": "datanode",
                    "parent_group_name": top,
                }
            )

        cluster_vars.update(
            {
                "postgres_conf_settings": {
                    "log_min_messages": "debug1",
                },
                "log_line_prefix": "%m [pid: %p] [xid:%x]",
                "bdr_node_groups": bdr_node_groups,
                "bdr_extensions": extensions,
                "extra_postgres_packages": packages,
            }
        )

    def _shard_group_name(self, node):
        return "shard_group_%s" % int(1 + (node - 1) / self.args["instances_per_shard"])

    def update_instances(self, instances):
        super().update_instances(instances)
        for instance in instances:
            n = instance.get("node")
            vars = instance.get("vars", {})
            vars.update(
                {
                    "bdr_child_group": self._shard_group_name(n),
                }
            )
            instance["vars"] = vars