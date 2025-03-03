# Managing clusters in a disconnected or air-gapped environment

In a security controlled environment where no direct connection to the
Internet is allowed, it is necessary to provide all packages needed by
TPA to complete the deployment. This can be done via a local-repo on
each node in the cluster. TPA supports the addition of custom
repositories on each node via a
[local-repo](local-repo.md) and the required packages can be downloaded
using the [download-packages](tpaexec-download-packages.md) command.

## Preparation

Choose an internet connected machine where you can install TPA and
follow the instructions below to either copy an existing cluster
configuration or create a new cluster.

!!! Note
    If the air-gapped server does not already have TPA installed,
    follow the instructions
    [here](INSTALL.md#installing-tpa-without-internet-or-network-access-air-gapped)
    to install it.

If you have an existing cluster in a disconnected environment, all you
need on the internet connected host is the config.yml. Create a
directory and copy that file into it then run `tpaexec relink` on that
directory to generate the remaining files that would normally be created
by `tpaexec configure`.

Alternatively, to create a new configuration for an environment where
the target instances will not have network access, configure a new
cluster with this option:

    tpaexec configure --use-local-repo-only …

This will do everything that `--enable-local-repo` does, and disable the
configuration for all other package repositories. On RedHat instances,
this also includes disabling access to subscription-based services.

In an existing cluster, you can set `use_local_repo_only: yes` in
`config.yml`:

```yaml
cluster_vars:
    use_local_repo_only: yes
```

Note: that you do not need separate cluster configurations for internet
connected and disconnected environments, the options below work in both.

More info on [using local-repo for distributing packages](local-repo.md)

## Downloading packages

On the internet connected machine, ensure that you
have [docker installed](platform-docker.md) and run:

```shell
tpaexec download-packages cluster-dir --os <OS> --os-version <version>
```

See detailed description for
the [package downloader](tpaexec-download-packages.md).

## Copying packages to the target environment

The resulting repository will be contained in the
`cluster-dir/local-repo` directory. This is a complete package repo for
the target OS. Copy this directory, from the connected controller to the
disconnected controller that will be used to deploy the cluster. Place
the directory in the same place, beneath the cluster directory. TPA
will then copy packages to the instances automatically when `deploy` is
run.

## Deploying in a disconnected environment

Ensure that the cluster config.yml has been configured as above in
[Preparation](#preparation). Run `tpaexec provision` and `deploy` as you
would normally.

## Updating in a disconnected environment

You can use the [upgrade](tpaexec-upgrade.md) command to
perform updates in an air-gapped environment. Prior to running this
command you must run `download-packages` on the connected controller,
copy the updated repository to the disconnected controller *and* then
run `deploy` to copy these packages to the target instances.
