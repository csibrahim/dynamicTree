
const drawDynamicTree =  (divId, tooltipId, nodeHierarchy, links, radiusAttributes, colorAttributes) => {

    // props which you can dynamically change
    const props = {
        defaultRadius: 7,
        radiusRange: [7,40],
        links: {strokeWidth: 1, stroke:"#A0A0A0"},
        nodes: {rootColor: "#A0A0A0",strokeWidth: 0.5,stroke: "#484848"},
        label: {fill:"#484848",fontSize:10}
    }

    // build the svg and required groups
    const chartDiv = document.getElementById(divId);
    const width = chartDiv.clientWidth;
    const height = chartDiv.clientHeight;

    let svg = d3.select(`#${divId}`).select("svg");
    if (svg.node() === null) {
        const base = d3.select(`#${divId}`).append("svg").attr("class","baseSvg");
        svg = base.append("g").attr("class","baseSvg")
        svg.append("g").attr("class", "linkGroup");
        svg.append("g").attr("class", "nodeGroup");
    }

    // set up the zoom capability
    const baseSvg = d3.select(".baseSvg");
    baseSvg.attr("width",width).attr("height",height);
    svg.attr("transform",`translate(${0},${0})`)

    const zoom = d3
        .zoom()
        .scaleExtent([0.1,1])
        .on("zoom", (event) => {
            const { x, y, k } = event.transform;
            svg.attr("transform", `translate(${x},${y}) scale(${k})`);

        });

    baseSvg.call(zoom).on("dblclick.zoom", null);

    // base svg click to reset tooltip to hidden
    baseSvg.on("click",(event) => {
        if(event.srcElement.tagName === "svg"){ // need this as otherwise triggers on every click
            d3.select(`#${tooltipId}`)
                .style("visibility", "hidden")
                .html("")
        }
    })

    // set up radius scale - works on the min/max across the hierarchy of the selected radiusVar
    // radius range is in props above
    let radiusVar = radiusAttributes[0] ;
    let radiusExtent = d3.extent(nodeHierarchy.descendants(), (d) => d.data[radiusVar]);

    const radiusScale =  d3
        .scaleSqrt()
        .domain(radiusExtent)
        .range(props.radiusRange);

    // set up the colorScale
    let colorVar = colorAttributes[0];
    const getColorSet = (colorVar) => Array.from(nodeHierarchy.descendants().reduce((acc, node) => {acc.add(node.data[colorVar]); return acc}, new Set()))

    // by default this is the label variable of the 1st level which is set to "defaultColor" - this can be changed
    let colorDomain = getColorSet("defaultColor");
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(colorDomain);

    // select link + node group
    const linkGroup = svg.select(".linkGroup");
    const nodeGroup = svg.select(".nodeGroup");
    // clone hierarchy
    const chartNodes = nodeHierarchy.copy();
    // set to starting position with root node visible and children hidden
    chartNodes.descendants()
        .forEach((d) => {
            if(d.depth === 0){ // fixing root node to centre
                d.fx = width/2;
                d.fy = height/2;
            }
            if(d.children){
                if(d.depth >= 0){
                    d.data._children = d.children; // hiding children using _children is standard d3 practice
                    d.children = undefined;
                }
            }
        });


    // returns scaled radius or default depending on whether node has children and is expanded
    const getRadius = (d) => d.children ? props.defaultRadius : radiusScale(d.data[radiusVar]);
    // set simulation = links, radial by depth, don't collide
    const simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id((d) => d.data.name))
        .force("radial", d3.forceRadial(d => d.depth * (width/3), width / 2, height / 2).strength(0.4))
        .force("collide", d3.forceCollide().radius((d) => getRadius(d) * 3).strength(1).iterations(6))

    // so there are no errors fetching as d3 manipulates the data
    const getLinkId = (link, linkType) => typeof link[linkType] === "string" ? link[linkType] : link[linkType].data.name;

    const fixNodes = (nodes) => {
        // stops the wiggling
        nodes.map((m) => {
            if(m.depth > 0){
                m.fx = m.x;
                m.fy = m.y;
            }
        })
    }
    const drawTree = () => {
        // get nodes for this draw + fix them
        const nodes = chartNodes.descendants();
        fixNodes(nodes);
        // filter links so only those  related to visible nodes
        const chartLinks = links.filter((f) => nodes.some((s) => s.data.name === getLinkId(f, "source")) && nodes.some((s) => s.data.name === getLinkId(f,"target")))
        // linksGroup append
        const linksGroup = linkGroup
            .selectAll(".linksGroup")
            .data(chartLinks, (d) => d.key)
            .join((group) => {
                const enter = group.append("g").attr("class", "linksGroup");
                enter.append("line").attr("class", "linkLine");
                return enter;
            });

        linksGroup
            .select(".linkLine")
            .attr("stroke-width",props.links.strokeWidth)
            .attr("stroke", props.links.stroke)
            .attr("opacity",0)
            .interrupt()
            .transition()
            .duration((d) => d.target.expanded ? 500 : 0)
            .attr("opacity",1); // transition only applies to recently expanded nodes

        // nodes group append
        const nodesGroup = nodeGroup
            .selectAll(".nodesGroup")
            .data(nodes, (d) => d.data.key)
            .join((group) => {
                const enter = group.append("g").attr("class", "nodesGroup");
                enter.append("circle").attr("class", "nodeBackgroundCircle");
                enter.append("circle").attr("class", "nodeCircleOutline");
                enter.append("circle").attr("class", "nodeCircle");
                enter.append("rect").attr("class","nodeLabelBackground")
                enter.append("text").attr("class", "nodeLabel");
                enter.append("g").attr("class","nodePieGroup");
                return enter;
            });


        nodesGroup
            .attr("cursor","pointer")
            .on("click", (event, d) => {
                // populate tooltip
                d3.select(`#${tooltipId}`)
                    .style("visibility", "visible")
                    .html(getTooltipHtml(d,colorVar, colorScale, d.depth > 0 && colorVar === colorAttributes[0]));
                // .children === visible, .data._children === hidden
                // flip visibility depending on status and set expanded to true if expanding
                if(!d.children  && d.data._children){
                    d.children = d.data._children;
                    d.data._children = undefined;
                    d.children.map((m) => {
                        m.expanded = true
                    });
                } else if (d.children !== undefined){
                    d.data._children = d.children;
                    d.children = undefined;
                }
                // redraw
                drawTree();
        })

        nodesGroup // so link doesn't show between circle and dashed circle
            .select(".nodeBackgroundCircle")
            .attr("pointer-events","none")
            .attr("r",  (d) => d.children ? 1 + getRadius(d) * 1.25 : getRadius(d))
            .attr("fill", "white")
            .attr("stroke-width", 0)

        nodesGroup
            .select(".nodeCircle")
            .attr("r", getRadius)
            .attr("fill", (d) => d.depth === 0 ? props.nodes.rootColor : colorScale(colorVar === colorAttributes[0] ? d.data.defaultColor : d.data[colorVar]))
            .attr("stroke", props.nodes.stroke)
            .attr("stroke-width", 0)
            .interrupt()
            .attr("opacity",0)
            .transition()
            .duration((d) => d.expanded ? 500 : 0)
            .attr("opacity",1); // transition only applies to recently expanded nodes

        nodesGroup // dashed circle
            .select(".nodeCircleOutline")
            .attr("pointer-events","none")
            .attr("r",(d) =>  getRadius(d) + 3)
            .attr("stroke", (d) => d.depth === 0 ? props.nodes.rootColor : colorScale(colorVar === colorAttributes[0] ? d.data.defaultColor : d.data[colorVar]))
            .attr("fill", "none")
            .attr("stroke-dasharray", "2,1")
            .attr("stroke-width", (d) => d.children || d.data._children ? 1 : 0)

        nodesGroup // rectangle behind label to make it more readable above links
            .select(".nodeLabelBackground")
            .attr("width", (d) => measureWidth(d.data.label,props.label.fontSize) + 2)
            .attr("height", props.label.fontSize)
            .attr("x",(d) => -measureWidth(d.data.label,props.label.fontSize)/2 - 1)
            .attr("y",(d) =>  getRadius(d) + 1.5 + (d.children || d.data._children ? 3 : 0))
            .attr("rx",3)
            .attr("ry",3)
            .attr("fill","white");

        nodesGroup
            .select(".nodeLabel")
            .attr("fill", props.label.fill)
            .attr("font-size",props.label.fontSize)
            .attr("dx", 0)
            .attr("dy", (d) => props.label.fontSize + getRadius(d) + (d.children || d.data._children ? 3 : 0))
            .attr("text-anchor", "middle")
            .text((d) =>d.data.label)
            .attr("opacity",0)
            .interrupt()
            .transition()
            .delay((d) => d.expanded ? 200 : 0)
            .duration((d) => d.expanded ? 500 : 0)
            .attr("opacity",1); // transition only applies to recently expanded nodes

        // pies group
        const nodePiesGroup = nodesGroup.select(".nodePieGroup")
            .selectAll(".nodePiesGroup")
            .data( (d) => typeof d.data[colorVar] === "string" || colorVar === colorAttributes[0]? [] :
                d3.pie().value((v) => v.count)(d.data[colorVar]) // d3.pie() slices the data
                        .reduce((acc, entry) => {
                            const radius = getRadius(d); // custom arc depending on radius
                            const path = d3.arc().innerRadius(0).outerRadius(radius)(entry); // arc generates the path from the sliced data
                            acc.push({type: entry.data.type, path, radius});
                            return acc;
                        },[]))
            .join((group) => {
                const enter = group.append("g").attr("class", "nodePiesGroup");
                enter.append("path").attr("class", "piePath");
                return enter;
            });

            nodePiesGroup.select(".piePath")
                .attr("fill",(d) => colorScale(d.type))
                .attr("d", (d) => d.path)

        // standard d3 drag functionality - fixNodes on start so only node in question moves
        const dragstarted = (event, d) => {
            if(d.depth > 0) {
                fixNodes(nodes);
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            }
        };

        const dragged = (event, d) => {
            if(d.depth > 0) {
                d.fx = event.x;
                d.fy = event.y;
            }
        };

        const dragended = (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
        };
        // trigger drag functionality
        nodesGroup.call(
            d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended)
        );

        // reset so none expanded (and no transition)
        nodes.map((m) => m.expanded = false);
        // simulation settings
        simulation.nodes(nodes);
        simulation.force("link").links(chartLinks);
        simulation.alpha(1).restart();

        let tickCount = 0;
        simulation.on("tick", () => {
            svg
                .selectAll(".linkLine")
                .attr("x1", (d) => d.source.x)
                .attr("x2", (d) => d.target.x)
                .attr("y1", (d) => d.source.y)
                .attr("y2", (d) => d.target.y);

            nodesGroup
                .attr("transform", (d) => `translate(${d.x},${d.y})`);
            tickCount += 1;
            if(tickCount === 25){
                // zoom after 25 ticks so nodes pretty much in place
                zoomToBounds(nodes, baseSvg,width,height,zoom);
            }
        })
    }

    // initial chart draw
    drawTree();

    // populate select boxes from data
    d3.select(".radiusSelect")
        .selectAll("option")
        .data(radiusAttributes)
        .enter().append("option")
        .attr("value", (d) => d)
        .text((d) => d);

    d3.select(".colorSelect")
        .selectAll("option")
        .data(colorAttributes)
        .enter().append("option")
        .attr("value", (d) => d)
        .text((d) => d);

    // set select functionality - reset var, domain and scale - then redraw
    d3.select(".radiusSelect")
        .on("change", (event) => {
            const value = event.currentTarget.value;
            radiusVar = value;
            radiusExtent = d3.extent(nodeHierarchy.descendants(), (d) => d.data[radiusVar]);
            radiusScale.domain(radiusExtent);
            drawTree();
        });

    d3.select(".colorSelect")
        .on("change", (event) => {
            const value = event.currentTarget.value;
            colorVar = value;
            colorDomain = getColorSet(colorVar);
            colorScale.domain(colorDomain);
            drawTree();
        })
}
