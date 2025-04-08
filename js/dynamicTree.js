
const drawDynamicTree =  (divId, tooltipId, nodeHierarchy, links, radiusAttributes, colorAttributes) => {

    const props = {
        defaultRadius: 5,
        radiusRange: [5,40],
        links: {strokeWidth: 1, stroke:"#A0A0A0"},
        nodes: {strokeWidth: 0.5,stroke: "#484848"},
        label: {fill:"#484848",fontSize:10}
    }

    // formatData will return
    // list of nodes + links
    // colorAttributes -  can be used for colorPies
    // radiusAttributes - can be used for radius size
    // adding any additional string (color) or number (radius) attributes to your gephi dataset
    // should automatically add them to the list AND aggregate them in the data


    // TO DO
    // add labels (final children only) - added for all, can easily hide
    // zoom to fit - not quite right
    // add color pies
    // hook up color pies

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

    let radiusVar = radiusAttributes[0] ;
    let colorVar = colorAttributes[0];

    let radiusExtent = d3.extent(nodeHierarchy.descendants(), (d) => d.data[radiusVar]);


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

    const radiusScale =  d3
        .scaleSqrt()
        .domain(radiusExtent)
        .range(props.radiusRange);

    const getColorSet = (colorVar) => Array.from(nodeHierarchy.descendants().reduce((acc, node) => {acc.add(node.data[colorVar]); return acc}, new Set()))
    let colorDomain = getColorSet("defaultColor");
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10).domain(colorDomain);

    const linkGroup = svg.select(".linkGroup");
    const nodeGroup = svg.select(".nodeGroup");

    const chartNodes = nodeHierarchy.copy();

    chartNodes.descendants()
        .forEach((d) => {
            if(d.depth === 0){ // fixing root node to centre
                d.fx = width/2;
                d.fy = height/2;
            }
            if(d.children){
                if(d.depth >= 0){
                    d.data._children = d.children;
                    d.children = undefined;
                }
            }
        });


    const getRadius = (d) => d.children ? props.defaultRadius : radiusScale(d.data[radiusVar]);

    d3.select(".radiusSelect")
        .on("change", (event) => {
            const value = event.currentTarget.value;
            radiusVar = value;
            radiusExtent = d3.extent(nodeHierarchy.descendants(), (d) => d.data[radiusVar]);
            radiusScale.domain(radiusExtent);
            svg.selectAll(".nodeCircle")
                .transition()
                .duration(400)
                .attr("r", getRadius);

            svg.selectAll(".nodeLabel")
                .transition()
                .duration(400)
                .attr("dy", (d) => props.label.fontSize + getRadius(d));

            svg.selectAll(".nodeLabelBackground")
                .transition()
                .duration(400)
                .attr("y",(d) =>  getRadius(d) + 1.5);
        })


    const simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id((d) => d.data.name))
        .force("radial", d3.forceRadial(d => d.depth * (width/2), width / 2, height / 2))
        .force("collide", d3.forceCollide().radius((d) => getRadius(d) * 5).strength(1).iterations(6))

    const getLinkId = (link, linkType) => typeof link[linkType] === "string" ? link[linkType] : link[linkType].data.name;

    const fixNodes = (nodes) => {
        nodes.map((m) => {
            if(m.depth > 0){
                m.fx = m.x;
                m.fy = m.y;
            }

        })
    }
    const drawTree = () => {

        const nodes = chartNodes.descendants();
        fixNodes(nodes);
        const chartLinks = links.filter((f) => nodes.some((s) => s.data.name === getLinkId(f, "source")) && nodes.some((s) => s.data.name === getLinkId(f,"target")))

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
            .attr("stroke", props.links.stroke);

        const nodesGroup = nodeGroup
            .selectAll(".nodesGroup")
            .data(nodes, (d) => d.data.key)
            .join((group) => {
                const enter = group.append("g").attr("class", "nodesGroup");
                enter.append("circle").attr("class", "nodeCircle");
                enter.append("rect").attr("class","nodeLabelBackground")
                enter.append("text").attr("class", "nodeLabel");
                enter.append("g").attr("class","nodePieGroup");
                return enter;
            });

        nodesGroup
            .attr("cursor","pointer")
            .on("mouseover", (event,d) => {
                d3.select(`#${tooltipId}`)
                    .style("visibility", "visible")
                    .html(getTooltipHtml(d,colorVar, colorScale, d.depth > 0 && colorVar === colorAttributes[0]))
            })
            .on("mouseout", () => {
                d3.select(`#${tooltipId}`)
                    .style("visibility", "hidden")
                    .html("")
            })
            .on("click", (event, d) => {
            if(!d.children  && d.data._children){
                d.children = d.data._children;
                d.data._children = undefined;
            } else if (d.children !== undefined){
                d.data._children = d.children;
                d.children = undefined;
            }
            drawTree();
        })

        nodesGroup
            .select(".nodeCircle")
            .attr("r", getRadius)
            .attr("fill", (d) => d.depth === 0 || (d.depth === 3 && colorVar !== colorAttributes[0])? "#A0A0A0" : colorScale(d.data.defaultColor))
            .attr("stroke", props.nodes.stroke)
            .attr("stroke-width", props.nodes.strokeWidth)

        nodesGroup
            .select(".nodeLabelBackground")
            .attr("width", (d) => measureWidth(d.data.label,props.label.fontSize) + 2)
            .attr("height", props.label.fontSize)
            .attr("x",(d) => -measureWidth(d.data.label,props.label.fontSize)/2 - 1)
            .attr("y",(d) =>  getRadius(d) + 1.5)
            .attr("rx",3)
            .attr("ry",3)
            .attr("fill","white");

        nodesGroup
            .select(".nodeLabel")
            .attr("fill", props.label.fill)
            .attr("font-size",props.label.fontSize)
            .attr("dx", 0)
            .attr("dy", (d) => props.label.fontSize + getRadius(d))
            .attr("text-anchor", "middle")
            .text((d) =>d.data.label);

        const nodePiesGroup = nodesGroup.select(".nodePieGroup")
            .selectAll(".nodePiesGroup")
            .data( (d) => typeof d.data[colorVar] === "string" || colorVar === colorAttributes[0]? [] :
                d3.pie().value((v) => v.count)(d.data[colorVar]).reduce((acc, entry) => {
                    const radius = getRadius(d);
                    const path = d3.arc().innerRadius(0).outerRadius(radius)(entry);
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
        nodesGroup.call(
            d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended)
        );

        simulation.nodes(nodes);
        simulation.force("link").links(chartLinks);
        simulation.alpha(1).restart();

        simulation.on("tick", () => {
            svg
                .selectAll(".linkLine")
                .attr("x1", (d) => d.source.x)
                .attr("x2", (d) => d.target.x)
                .attr("y1", (d) => d.source.y)
                .attr("y2", (d) => d.target.y);

            nodesGroup.attr("transform", (d) => `translate(${d.x},${d.y})`);
        })

        zoomToBounds(nodes, baseSvg,width,height,zoom);


    }

   drawTree();

    d3.select(".colorSelect")
        .on("change", (event) => {
            const value = event.currentTarget.value;
            colorVar = value;
            colorDomain = getColorSet(colorVar);
            colorScale.domain(colorDomain);
            drawTree();
        })
}
