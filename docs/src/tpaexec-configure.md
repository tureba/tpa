# Cluster configuration

The `tpaexec configure` command generates a YAML cluster configuration
file that is required by subsequent stages in the provision/deploy/test
cycle.

## Quickstart

```bash
[tpa]$ tpaexec configure ~/clusters/speedy --architecture M1
```

This command will create a directory named `~/clusters/speedy` and
generate a configuration file named `config.yml` that follows the
layout of the architecture named M1 (single primary, N replicas).

The command also accepts various options (some specific to the selected
architecture or platform) to modify the configuration, but the defaults
are sensible and intended to be usable straightaway. You are encouraged
to read the generated config.yml and fine-tune the configuration to suit
your needs. (Here's an overview of [configuration settings that affect
the deployment](configure-instance.md).)

It's possible to write config.yml entirely by hand, but it's much easier
to edit the generated file.

## Configuration options

The first argument must be the cluster directory, e.g., `speedy` or
`~/clusters/speedy` (the cluster will be named speedy in both cases).
We recommend that you keep all your clusters in a common directory,
e.g., `~/clusters` in the example above.

The next argument must be `--architecture <name>` to select an
architecture, e.g.,
[M1](architecture-M1.md) or
[BDR-Simple](architecture-BDR-Simple.md).
For a complete list of architectures, run
`tpaexec info architectures`.

The arguments above are always mandatory. The rest of the options
described here may be safely omitted, as in the example above; the
defaults will lead to a usable result.

Run `tpaexec help configure-options` for a list of common options.

### Architecture-specific options

The architecture you select determines what other options are accepted.
Typically, each architecture accepts some unique options as well as the
generic options described below.

For example, with M1 you can use `--num-cascaded-replicas 3` to create
a cluster with three cascaded replicas. With BDR-Simple, you can use
`--num-instances 2` for a two-instance BDR cluster. Please consult the
documentation for an architecture for a list of options that it accepts
(or, in some cases, requires).

### Platform options

Next, you may use `--platform <name>` to select a platform, e.g.,
[aws](platform-aws.md) or [bare](platform-bare.md).

An architecture may or may not support a particular platform. If not, it
will fail to configure the cluster.

The choice of platform affects the interpretation of certain options.
For example, if you choose aws, the arguments to
`--region <region>` and
`--instance-type <type>`
must be a valid
[AWS region name](https://docs.aws.amazon.com/general/latest/gr/rande.html)
and
[EC2 instance type](https://aws.amazon.com/ec2/instance-types/)
respectively. Please refer to the platform documentation for more details.

If you do not explicitly select a platform, the default is currently
aws.

**Note:** TPAexec fully supports creating clusters with instances on
different platforms, but `tpaexec configure` cannot currently generate
such a configuration. You must edit config.yml to specify multiple
platforms.

### Owner

Specify `--owner <name>` to associate the cluster (by some
platform-specific means, e.g., AWS tags) with the name of a person
responsible for it. This is especially important for cloud platforms. By
default, the owner is set to the login name of the user running
`tpaexec provision`.

(You may use your initials, or "Firstname Lastname", or anything else
that identifies you uniquely.)

### Region

Specify `--region <region>` to select a region.

This option is meaningful only for cloud platforms. The default for AWS
is eu-west-1.

**Note:** TPAexec fully supports creating clusters that span multiple
regions, but `tpaexec configure` cannot currently generate such a
configuration. You must edit config.yml to specify multiple regions.

### Subnet selection

Specify `--subnet 192.0.2.128/27` to use a particular subnet, or
`--subnet-pattern 192.0.x.x` to generate random subnets (as many as
required by the architecture) matching the given pattern.

By default, each cluster is assigned a random /28 subnet under 10.33/16,
but depending on the architecture, there may be one or more subnets, and
each subnet may be anywhere between a /24 and a /29.

This option is not meaningful for the "bare" platform, where TPAexec
will not alter the network configuration of existing servers.

### Instance type

Specify `--instance-type <type>` to select an instance type.

This option is meaningful only for cloud platforms. The default for AWS
is t3.micro.

### Disk space

Specify `--root-volume-size 64` to set the size of the root volume in
GB. (Depending on the platform, there may be a minimum size required for
the root volume.)

The `--postgres-volume-size <size>` and
`--barman-volume-size <size>` options are available to set the sizes
of the Postgres and Barman volumes on those architectures and platforms
that support separate volumes for Postgres and Barman.

None of these options is meaningful for the "bare" platform, where
TPAexec has no control over volume sizes.

### Hostnames

By default, `tpaexec configure` will randomly select as many hostnames
as it needs from a pre-approved list of several dozen names. This should
be enough for most clusters.

Specify `--hostnames-from <filename>` to select hostnames from a file
with one name per line. The file must contain at least as many valid
hostnames as there are instances in your cluster.

Use `--hostnames-pattern '…pattern…'` to limit the selection to
lines matching an egrep pattern.

Use `--hostnames-sorted-by="--dictionary-order"` to select a sort(1)
option other than `--random-sort` (which is the default).

Use `--hostnames-unsorted` to not sort hostnames at all. In this case,
they will be assigned in the order they are found in the hostnames file.

## Software selection

### Distribution

Specify `--distribution <name>` to select a distribution.

The selected platform determines which distributions are available, and
which one is used by default.

In general, you should be able to use "Debian", "RedHat", and "Ubuntu"
to select TPA images that have Postgres and other software preinstalled
(to reduce deployment times). To use stock distribution images instead,
append "-minimal" to the label, e.g., "Debian-minimal".

This option is not meaningful for the "bare" platform, where TPAexec has
no control over which distribution is installed.

### 2ndQuadrant repositories

TPAexec can enable any 2ndQuadrant software repository that you have
access to through the 2ndQuadrant Portal subscription mechanism.

By default, it will install the 2ndQuadrant public repository (which
does not need a subscription) and add on any product repositories that
the architecture may require (e.g., the BDR repository).

Use `--2Q-repositories source/name/maturity …`
to specify the complete list of 2ndQuadrant repositories to install on
each instance in addition to the 2ndQuadrant public repository. Use this
option with care. TPAexec will configure the named repositories with no
attempt to make sure the combination is appropriate.

To use product repositories, you must first
`export TPA_2Q_SUBSCRIPTION_TOKEN=xxx` before you run tpaexec. You can
get your subscription token from the 2ndQuadrant Portal, under "Company
info" in the left menu, then "Company".

### EnterpriseDB repositories

In order to install software from EnterpriseDB's APT and YUM repositories
you must first `export EDB_REPO_CREDENTIALS_FILE=/path/to/credentials/file`
before you run tpaexec. Credentials file is a text file that contains your
access credentials in the `username:password` format. If you don't have them
already, you can get your access credentials by registering for access at
https://www.enterprisedb.com/user/register?destination=/repository-access-request

### Software versions

You may optionally specify `--postgres-version 10` (the default) or
any other major version of Postgres (e.g., 9.6). TPA supports Postgres
9.4 and above. Postgres 9.4 and 9.5 were known to work at one time, but
are no longer actively maintained.

By default, we always install the latest version of every package. This
is usually the desired behaviour, but in some testing scenarios, it may
be necessary to select specific package versions using any of the
following options:

1. `--postgres-package-version 10.4-2.pgdg90+1`
2. `--repmgr-package-version 4.0.5-1.pgdg90+1`
3. `--barman-package-version 2.4-1.pgdg90+1`
4. `--pglogical-package-version '2.2.0*'`
5. `--bdr-package-version '3.0.2*'`
5. `--pgbouncer-package-version '1.8*'`

You may use any version specifier that apt or yum would accept.

If your version does not match, try appending a `*` wildcard. This
is often necessary when the package version has an epoch qualifier
like `2:...`.

You may optionally specify `--epas` which sets `postgresql_flavour` to
`epas` in the generated config.yml. This means that tpaexec will install
EnterpriseDB Postgres Advanced Server (requires EDB repository access)
instead of community Postgres (the default).

Since EPAS supports both Oracle and postgres compatiblity features,
by default, EPAS initializes the cluster in `redwood` i.e. Oracle
compatibility mode. In order to initialize the cluster in postgres
mode, you may optionally specify `--no-redwood` which sets
`epas_redwood_compat` to False in the generated config.yml.

You may also specify `--extra-packages p1 p2 …` or
`--extra-postgres-packages p1 p2 …` to install additional packages.
The former lists packages to install along with system packages, while
the latter lists packages to install later along with postgres packages.
(If you mention packages that depend on Postgres in the former list, the
installation will fail because Postgres will not yet be installed.) The
arguments are passed on to the package manager for installation without
any modifications.

The `--extra-optional-packages p1 p2 …` option behaves like
`--extra-packages`, but it is not an error if the named packages
cannot be installed.

### Building and installing from source

If you specify `--install-from-source postgres`, Postgres will be
built and installed from a git repository instead of installed from
packages. Use `2ndqpostgres` instead of `postgres` to build and
install 2ndQPostgres. By default, this will build the appropriate
`REL_nnn_STABLE` branch.

You may use `--install-from-source 2ndqpostgres pglogical3 bdr3` to
build and install all three components from source, or just use
`--install-from-source pglogical3 bdr3` to use packages for
2ndQPostgres, but build and install pglogical v3 and BDR v3 from source.
By default, this will build the `master` branch of pglogical and BDR.

To build a different branch, append `:branchname` to the corresponding
argument. For example `--install-from-source 2ndqpostgres:dev/xxx`, or
`pglogical:bug/nnnn`.

You may not be able to install packages that depend on a package that
you chose to replace with a source installation instead. For example,
BDR v3 packages depend on pglogical v3 packages, so you can't install
pglogical from its source repository and BDR from packages. Likewise,
you can't install Postgres from source and pglogical from packages.

## Overrides

You may optionally specify `--overrides-from a.yml …` to load one or
more YAML files with settings to merge into the generated config.yml.

Any file specified here is first expanded as a Jinja2 template, and the
result is loaded as a YAML data structure, and merged recursively into
the arguments used to generate config.yml (comprising architecture and
platform defaults and arguments from the command-line). This process is
repeated for each additional override file specified; this means that
settings defined by one file will be visible to any subsequent files.

For example, your override file might contain:

```
cluster_tags:
  some_tag: "{{ lookup('env', 'SOME_ENV_VAR') }}"

cluster_vars:
  synchronous_commit: remote_write
  postgres_conf_settings:
    effective_cache_size: 4GB
```

These settings will augment `cluster_tags` and `cluster_vars` that
would otherwise be in config.yml. Settings are merged recursively, so
`cluster_tags` will end up containing both the default Owner tag as
well as `some_tag`. Similarly, the `effective_cache_size` setting
will override that variable, leaving other `postgres_conf_settings`
(if any) unaffected. In other words, you can set or override specific
subkeys in config.yml, but you can't empty or replace `cluster_tags`
or any other hash altogether.

The merging only applies to hash structures, so you cannot use this
mechanism to change the list of `instances` within config.yml. It is
most useful to augment `cluster_vars` and `instance_defaults` with
common settings for your environment.

That said, the mechanism does not enforce any restrictions, so please
exercise due caution. It is a good idea to generate two configurations
with and without the overrides and diff the two config.yml files to make
sure you understand the effect of all the overrides.

## Examples

Let's see what happens when we run the following command:

```bash
[tpa]$ tpaexec configure ~/clusters/speedy --architecture M1 \
        --num-cascaded-replicas 2 --distribution Debian-minimal \
        --platform aws --region us-east-1 --subnet-pattern 10.33.x.x/28 \
        --instance-type t2.medium --root-volume-size 32 \
        --postgres-volume-size 64 --barman-volume-size 128 \
        --postgres-version 9.6
[tpa]$
```

There is no output, so there were no errors. The cluster directory has
been created and populated.

```bash
$ ls ~/clusters/speedy
total 8
drwxr-xr-x 2 ams ams 4096 Aug  4 16:23 commands
-rw-r--r-- 1 ams ams 1374 Aug  4 16:23 config.yml
lrwxrwxrwx 1 ams ams   51 Aug  4 16:23 deploy.yml -> 
                         /home/ams/work/2ndq/TPA/architectures/M1/deploy.yml
```

The cluster configuration is in config.yml, and its neighbours are links
to architecture-specific support files that you need not interact with
directly. Here's what the configuration looks like:

```yaml
---
architecture: M1

cluster_name: speedy
cluster_tags: {}

ec2_vpc:
  Name: Test

ec2_ami:
  Name: debian-stretch-hvm-x86_64-gp2-2018-08-20-85640
  Owner: 379101102735

ec2_vpc_subnets:
  us-east-1:
    10.33.161.64/28:
      az: us-east-1a
    10.33.189.80/28:
      az: us-east-1b

cluster_vars:
  postgres_version: 9.6
  tpa_2q_repositories: []
  vpn_network: 192.168.33.0/24

instance_defaults:
  platform: aws
  type: t2.medium
  region: us-east-1
  default_volumes:
    - device_name: root
      volume_type: gp2
      volume_size: 32
    - device_name: /dev/xvdf
      volume_type: gp2
      volume_size: 64
      vars:
        volume_for: postgres_data
  vars:
    ansible_user: admin

instances:
  - node: 1
    Name: quirk
    role: primary
    subnet: 10.33.161.64/28

  - node: 2
    Name: keeper
    role: replica
    upstream: quirk
    backup: zealot
    subnet: 10.33.161.64/28

  - node: 3
    Name: zealot
    role:
      - barman
      - log-server
      - openvpn-server
      - monitoring-server
      - witness
    volumes:
        - device_name: /dev/xvdf
          volume_type: gp2
          volume_size: 128
          vars:
            volume_for: barman_data
    subnet: 10.33.189.80/28

  - node: 4
    Name: quaver
    role: replica
    upstream: keeper
    subnet: 10.33.189.80/28

  - node: 5
    Name: quavery
    role: replica
    upstream: keeper
    subnet: 10.33.189.80/28

```

The next step is to run [`tpaexec provision`](tpaexec-provision.md)
or learn more about how to customise the configuration of
[the cluster as a whole](configure-cluster.md) or how to configure an
[individual instance](configure-instance.md).