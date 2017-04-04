/**
 * Generate SVG diagrams from TPA clusters using d3 and the TPA API.
 */

import * as d3 from "d3";

import * as tpa from "./tpa-api";
import {Accumulator, sort_by_attr} from "./utils";
import {make_rect} from "./geometry";
import {setup_viewport, tree_rotate} from "./diagram";
import {get_url_vars} from "./utils";

const MIN_NODE_HEIGHT = 20;
const MIN_NODE_WIDTH = 100;
const MAX_CIRCLE_RADIUS = MIN_NODE_HEIGHT*0.66;

const LINK_CONNECTOR_HEIGHT = 5;
const LINK_CONNECTOR_LENGTH = MIN_NODE_WIDTH;

// Fudge factors to include instance label in selection box.
const ISOF_Y = 1.6/2;
const ISOF_X = 0.5;
const ISF_X = 1.5;
const ISF_Y = 1.25;


const DG_POSTGRES_ROLES = {
    primary: true,
    replica: true,
    barman: true
};


export function show_cluster_diagram() {
    const container = d3.select(".cluster_diagram");
    if (container.empty()) {
        return;
    }

    let vars = get_url_vars();

    if (vars.cluster) {
        d3.select("button.next-cluster").style("visibility", "hidden");
        display_cluster_by_uuid(vars.cluster, container);
    }
}


function clear_detail_panel() {
    d3.selectAll(".selected_instance_detail")
        .selectAll("*")
        .remove();
}

function display_selected_instance_detail(instance) {
    function add_detail(selection, attr_name, attr_value) {
        if ( !attr_value ) { return; }

        let g = selection.append("div")
                .classed(`${attr_name} row`, true);

        g.append("div")
            .classed("attr_name col-xs-3", true)
            .html(attr_name+" ");
        g.append("div")
            .classed("attr_value col-xs-9", true)
            .html(attr_value);

        return g;
    }

    clear_detail_panel();

    let row = d3.selectAll(".selected_instance_detail");

    function detail_column() {
        return row.append("div").attr("class", "col-xs-4");
    }

    let mem = instance.instance_type.memory ?
        `, ${instance.instance_type.memory}g memory` : "";

    detail_column()
        .call(add_detail, 'Name', instance.name)
        .call(add_detail, 'Type', `${instance.instance_type.name}\
            (${instance.instance_type.vcpus} vcpus${mem})`)
        .call(add_detail, 'Description', instance.description);

    detail_column()
        .call(add_detail, 'Region', instance.subnet.zone.region.name)
        .call(add_detail, 'Zone', instance.subnet.zone.name)
        .call(add_detail, 'Subnet', instance.subnet.name)
        .call(add_detail, 'VPC', instance.subnet.vpc.name)
        .call(add_detail, 'Ext. IP', instance.assign_eip)
        .call(add_detail, 'Tags', instance.user_tags ?
            (Object.keys(instance.user_tags).map(
                k => k + ": " + instance.user_tags[k]).join(", "))
            : "");

    detail_column()
        .call(add_detail, 'Roles',
            instance.roles.map(r => r.role_type).join(", "))
        .call(add_detail, "Volumes",
            instance.volumes.map(vol => {
                let p = vol.delete_on_termination ?  "" : " persistent";
                return `${vol.name} (${vol.volume_size}g${p} ${vol.volume_type})`;
            }).join(", "));
}


export function display_cluster_by_uuid(cluster_uuid, viewport) {
    tpa.get_cluster_by_uuid(cluster_uuid, c => draw_cluster(c, viewport));
}


function draw_cluster(cluster, viewport) {
    let cluster_diagram = new ClusterDiagram(cluster, viewport);

    cluster_diagram.draw_items_of_class('zone', draw_zone);
    cluster_diagram.draw_items_of_class('rolelink', draw_rolelink);
    cluster_diagram.draw_items_of_class('instance', draw_instance);

    d3.selectAll(".cluster_name").text(cluster.name);
}


class ClusterDiagram {
    constructor (cluster, viewport) {
        this.cluster = cluster;
        this.viewport = viewport;

        this.dispatch = d3.dispatch("selected", "deselected");
        this.current_selection = null;
        this.setup_selection();

        let bbox = viewport.node().getBoundingClientRect();
        this.width = bbox.width;
        this.height = bbox.height;
        this.diagram = setup_viewport(viewport, bbox.width, bbox.height);

        [this.objects, this.parent_id] = this.build_graph();
        this.layout_graph();

        // map obj url -> diagram item
        this.dobj_for_model = {};

        this.root.eachAfter(d => {
            this.dobj_for_model[d.data.url] = d;
        });

        // Assign numerical order to each rolelink item on in-edges to its
        // parent.

        for (let d of this.root.descendants()) {
            if (tpa.model_class(d.data) != 'rolelink') continue;

            let p = this.dobj_for_model[d.data.server_instance.url];
            if (!p.num_children) { p.num_children = 0; }
            d.parent_idx = p.num_children++;
        }
    }

    on(event, callback) {
        return this.dispatch.on(event, callback);
    }

    setup_selection() {
        this.on("selected", function() {
            let node = this;
            let bbox = node.getBBox();
            d3.select(node)
                .classed("selected", true)
                .append("rect")
                    .classed("selection", true)
                    .attr("transform",
                        `translate(${-bbox.width*ISOF_X}, ${5-bbox.height*ISOF_Y})`)
                    .attr("width", bbox.width*ISF_X)
                    .attr("height", bbox.height*ISF_Y);
        });

        this.on("deselected", function() {
            d3.select(this)
                .classed("selected", false)
                .selectAll(".selection")
                .remove();
        });

        this.on("deselected.detail", function() {
            clear_detail_panel();
        });

        this.on("selected.detail", function() {
            display_selected_instance_detail(this.__data__.data);
        });

        clear_detail_panel();
    }

    get selection() {
        return this.current_selection;
    }

    set selection(d) {
        if(this.current_selection) {
            this.dispatch.call("deselected", this.current_selection);
            this.current_selection = null;
        }

        this.current_selection = d;
        this.dispatch.call("selected", this.current_selection);
    }

    build_graph() {
        if (tpa.cluster_type(this.cluster) == 'xl') {
            return build_xl_graph(this.cluster);
        }

        return build_tpa_graph(this.cluster);
    }

    layout_graph() {
        var table = d3.stratify()
            .id(d => d.url)
            .parentId(d => this.parent_id[d.url])
        (this.objects);

        this.root = d3.hierarchy(table);
        this.tree = d3.tree()
                    .size([this.height, this.width])
                    .nodeSize([this.height/15, MIN_NODE_WIDTH*1.5]);

        this.tree(this.root);
        tree_rotate(this.root);

        this.root.eachAfter(d => {
            // remove the double-reference introduced by stratify
            d.data = d.data.data;

            // set y position to same as first child.
            if (d.children && d.children.length > 0) {
                d.y = d.children[0].y;
            }
        });


        console.log("LAYOUT -----------");
        console.log("objects:", this.objects);
        console.log("stratified:", table);
        console.log("root:", this.root);
    }

    draw_items_of_class(klazz, draw) {
        this.diagram
            .selectAll("."+klazz)
            .data(this.root.descendants().filter(tpa.is_instance(klazz)))
            .enter()
            .call(d => draw(d, this)
                .classed(klazz, true)
            );
    }
}


// TPA Diagram


function build_xl_graph(cluster) {
    var parent_id = {};
    var objects = [cluster];
    var gtm_instances = [];
    var coord_instances = [];
    var roles = {}; // role url -> instance

    parent_id[cluster.url] =  "";

    cluster.subnets.forEach(function(s) {
        objects.push(s);
        parent_id[s.url] = cluster.url;

        s.instances.forEach(function(i) {
            objects.push(i);

            i.roles.forEach(function(r) {
                roles[r.url] = i;
                if (r.role_type == "gtm") {
                    gtm_instances.push(i);
                    parent_id[i.url] = s.url;
                }
                if (r.role_type == "coordinator") {
                    coord_instances.push(i);
                }
            });
        });
    });

    var gtm_center = gtm_instances[Math.floor(gtm_instances.length/2)];
    var coord_center = (coord_instances.length > 0) ?
            coord_instances[Math.floor(coord_instances.length/2)]
            : gtm_center;

    cluster.subnets.forEach(s =>
        s.instances.filter(i => !(i.url in parent_id))
            .forEach(function(i) {
                i.roles.forEach(function(r) {
                    switch (r.role_type) {
                        case 'datanode-replica':
                            r.client_links.forEach(function(ln) {
                                if (ln.name == 'datanode-replica') {
                                    objects.push(ln);
                                    parent_id[ln.url] = roles[ln.server_role].url;
                                    parent_id[i.url] = ln.url;
                                }
                            });
                            break;
                        case 'coordinator':
                            r.client_links.forEach(function(ln) {
                                if (ln.name == 'gtm') {
                                    objects.push(ln);
                                    parent_id[ln.url] = roles[ln.server_role].url;
                                    parent_id[i.url] = ln.url;
                                }
                            });
                            break;
                        case 'datanode':
                            r.client_links.forEach(function(ln) {
                                if (ln.name == 'coordinator' && !(i.url in parent_id)) {
                                    objects.push(r);
                                    parent_id[r.url] = coord_center.url;
                                    parent_id[i.url] = r.url;
                                }
                            });
                            break;
                    }
                });
                if ( !(i.url in parent_id)) {
                    parent_id[i.url] = coord_center.url;
                }
        }));

    return [objects, parent_id];
}


/**
 * Returns the objects and their parents relevant to drawing a cluster
 * as a tree.
 *
 * Cluster -> Region -> Zone -> Subnet -> Instance(root) ->
 * (-> rolelink -> instance)*
 */
function build_tpa_graph(cluster) {
    var accum = [];
    var objects = [cluster];
    var parent_id = {};
    var role_instance = {};
    var pg_instances = [];

    var zones = [], replica_zones = [];

    function add_instance_parent(instance, parent) {
        accum.push([instance, parent]);
    }

    // Sort zones by (has primary)/name
    for(let subnet of cluster.subnets) {
        if (tpa.subnet_has_primary(subnet)) {
            zones.push(subnet.zone);
        }
        else {
            replica_zones.push(subnet.zone);
        }
    }

    sort_by_attr(zones, 'name');
    sort_by_attr(replica_zones, 'name');
    zones = zones.concat(replica_zones);

    for (let zone of zones) {
        if (!(zone.url in parent_id)) {
            accum.push([zone, cluster]);
        }
    }

    // filter relevant instances
    for (let subnet of cluster.subnets) {
        for (let instance of subnet.instances) {
            let primary_role = tpa.instance_role(instance);
            if (primary_role && DG_POSTGRES_ROLES[primary_role.role_type]) {
                pg_instances.push(instance);
                for(let role of instance.roles) {
                    role_instance[role.url] = instance;
                }
            }
        }
    }

    sort_by_attr(pg_instances, 'name');

    // create instance graph
    let dummy_idx = 0;

    for (let client_instance of pg_instances) {
        for (let r of client_instance.roles) {
            if (!(r.role_type in DG_POSTGRES_ROLES)) continue;

            for (let client_link of r.client_links) {
                let server_instance = role_instance[client_link.server_role];
                if (client_instance == server_instance) continue;

                // FIXME for drawing role!
                client_link.server_instance = role_instance[client_link.server_role];

                if (server_instance.zone != client_instance.zone) {
                    server_instance = {
                        url: `dummyparent:${dummy_idx++}`,
                        zone: client_instance.zone
                    };

                    add_instance_parent(server_instance, client_instance.zone);
                }

                add_instance_parent(client_instance, client_link);
                accum.push([client_link, server_instance]);
            }
        }
    }

    // if an instance has no parent yet, the zone is its parent.
    for(let i of pg_instances) {
        if (!(i.url in parent_id)) {
            add_instance_parent(i, i.zone);
        }
    }

    // create final parent lookup
    accum.forEach(function([o, p]) {
        if (!(o.url in parent_id)) {
            objects.push(o);
            parent_id[o.url] = p.url;
        }
    });

    return [objects, parent_id];
}


/**
 * Drawing methods for diagram items by data class.
 */

function draw_zone(selection, cluster_diagram) {
    //var zone_sep_y = d3.local();

    var zone_display = selection.append('g')
        .classed('zone--empty',  d => d.children)
        .attr("transform", d => `translate(${-d.parent.x}, ${d.y})`)
        .property('model-url', d => d.data.url ? d.data.url : null);

    zone_display.append("text")
        .text(d => d.data.name);

    zone_display.append('line')
        .attr('x1', 0)
        .attr('y1', function (d) {
            return -MIN_NODE_HEIGHT*2;
        })
        .attr('x2', cluster_diagram.width)
        .attr('y2', function (d) {
            return -MIN_NODE_HEIGHT*2;
        });

    return zone_display;
}

function draw_instance(selection, cluster_diagram) {
    let node_rect = d3.local();
    let node_model = d3.local();
    let node_url = d3.local();

    let node = selection.append("g")
        .attr("class", d =>
            "instance node " + (d.children ? "node--internal" : "node--leaf"))
        .attr("transform", d => `translate(${d.x}, ${d.y})`)
        .property('model-url', d => d.data.url ? d.data.url : null)
        .on("click.selection", function(d) {
            cluster_diagram.selection = this;
        })
        .each(function(d) {
            let size = instance_size(d.data);
            node_model.set(this, d.data);
            node_url.set(this, d.data.url);
            node_rect.set(this, make_rect(size.width, size.height));
        });

    // icon
    node.append("path")
        .classed('icon', true)
        .attr('d', tpa.class_method()
            .default(function(d) {
                let ns = node_rect.get(this);

                let radius = MAX_CIRCLE_RADIUS*instance_vcpus(d.data);
                let diameter = 2*radius;

                return "M 0 0 " +
                    ` m -${radius}, 0` +
                    ` a ${radius},${radius} 0 1,1 ${diameter},0` +
                    ` a ${radius},${radius} 0 1,1 -${diameter},0`;
            }));

    // name
    node.append("text")
        .classed("name", true)
        .attr("transform", function(d) {
            let ns = node_rect.get(this);
            let offset = MAX_CIRCLE_RADIUS*(instance_vcpus(d.data)+0.25);
            return `translate(${offset},-${offset})`;
        })
        .text(d => d.data.name);

    return node;
}

function draw_rolelink(selection, cluster_diagram) {
    return selection.append("path")
        .classed("edge", true)
        .attr("d", function(d) {
            // draw line from server instance to client instance
            if ( !d.parent || !d.children) {
                return "";
            }
            let p = cluster_diagram.dobj_for_model[d.data.server_instance.url],
                c = d.children[0];
            let path = d3.path();

            let p_y = p.y + LINK_CONNECTOR_HEIGHT * d.parent_idx;
            let c_y = c.y;

            path.moveTo(p.x, p.y);
            path.lineTo(p.x, p_y);
            path.lineTo(p.x+LINK_CONNECTOR_LENGTH, p_y);
            path.lineTo(c.x-LINK_CONNECTOR_LENGTH, c_y);
            path.lineTo(c.x, c_y);
            return path;
        });
}


/*********
 * View and geometry helpers.
 */

function instance_size(instance) {
    return {width: MIN_NODE_WIDTH,
            height: MIN_NODE_HEIGHT};
}

function instance_vcpus(instance) {
    let vcpus = parseInt(instance.instance_type.vcpus);

    return Math.max(Math.sqrt(vcpus ? vcpus : 1), 1);
}
