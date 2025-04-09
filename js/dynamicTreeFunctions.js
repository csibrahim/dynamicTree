const formatData = (chartData,nodeSpecificAttributes, defaultColorVar) => {
    // formatting data so that
    // a) node attributes can be toggled to represent size
    // b) node attributes can be toggled to represent color
    // c) parent nodes can have color pie charts (if time)

    // no nodes = invalid data, return nothing
    if(chartData.nodes.length === 0)return {nodes: [],links:[]};
    // removing color, x and y from gephi data as not used
    const nodeAttributes = Object.keys(chartData.nodes[0].attributes)
        .filter((f) => f !== "color"  && f !== "x" && f !== "y");



    // root = only node with no target
    let root = chartData.nodes.filter((f) => !chartData.edges.some((s) => s.target === f.key));

    if(root.length > 1){
        chartData.nodes.push({
            "key": "root",
            "attributes": {
                "label": "root",
                "size": 0,
                "0": "root",
                "1":"",
                "2": 0,
                "3": 0,
                "4": 0
            }
        })
        root.forEach((d) => {
            chartData.edges.push({
                source: "root",
                target: d.key
            })
        })
        root = chartData.nodes.filter((f) => f.key === "root");

        // if more than one root = invalid data, returning nothing
        //console.error('Data Error: more than one root');
       // return {nodes: [],links:[]};
    }

    // building the hierarchy
    const getChildren = (childKeys) =>
        // loop through keys
        childKeys.reduce((acc, key) => {
            // find their child keys (ie source === key)
            const leaveKeys = chartData.edges
                .filter((f) => f.source === key)
                .map((m) => m.target);
            // repeat the process for their children (until end of tree)
            const leaveChildren = getChildren(leaveKeys);
            const child = {name: key};
            if(leaveChildren.length > 0){
                // add children if they exist - final leaf will have none
                child.children = leaveChildren;
            }
            acc.push(child)
            return acc;
        },[])

    const rootKey = root[0].key;
    // branchKeys = source === root
    const branchKeys = chartData.edges
        .filter((f) => f.source === rootKey)
        .map((m) => m.target);
    // build hierarchy and convert to d3.hierarchy format (enables manipulation)
    const hierarchy = d3.hierarchy({
        name: rootKey,
        children: getChildren(branchKeys)});
    // aggregating the node totals up the hierarchy (for radius, colour and pies)

    // for final level leaves only
    const getNodeData = (nodeKey) => {
        // find matching node
        const matchingNode = chartData.nodes.find((f) => f.key === nodeKey);
        const newNode = {name: matchingNode.key};
        // loop through attributes and add to data
        nodeAttributes.forEach((n) => newNode[n] = matchingNode.attributes[n]);
        return newNode
    }

    // group descendants by depth
    const descendantsByDepth = d3.group(hierarchy.descendants(), (g) => g.depth);
    // add data for final level leaf nodes
   // const bottomLevelNodes = descendantsByDepth.get(3);
   // bottomLevelNodes.map((m) => {
   //     m.data = getNodeData(m.data.name);
  //  })

    const radiusAttributes = new Set();
    const colorAttributes = new Set();
    // aggregation for parent nodes
    const getNodeTotals = (nodeName, nodeChildren) => {
        if(!nodeChildren){
            return getNodeData(nodeName);
        }
        const newNode = {name: nodeName};
        nodeAttributes.forEach((n) =>  {
            if(nodeSpecificAttributes.includes(n)){
                // for all nodeSpecificAttributes - just add data
                const matchingNode = chartData.nodes.find((f) => f.key === nodeName)
                newNode[n] = matchingNode.attributes[n];
            } else if(typeof nodeChildren[0].data[n] === "number"){
                // numbers are easy - simply aggregate
                newNode[n] = d3.sum(nodeChildren,(s) => s.data[n]);
                // add to radius attributes set
                radiusAttributes.add(n);
            } else {
                // strings
                // add to color attributes set
                colorAttributes.add(n);
                newNode[n] = Array.from(nodeChildren.reduce((acc, child) => {
                    if(typeof child.data[n] === "string"){
                        // level 2 (one up from final leaf)
                        const currentType = child.data[n];
                        const matchingType = acc.find((f) => f.type === currentType);
                        // either add or aggregate depending on whether it exists already
                        if(matchingType){
                            matchingType.count += 1;
                        } else {
                            acc.push({type: currentType, count: 1})
                        }
                    } else {
                        if(acc.length === 0){
                            // first instance === copy (deep cloned)
                            acc = JSON.parse(JSON.stringify(child.data[n]));
                            acc.forEach((a) => a.count = +a.count);
                        } else {
                            // then loop through
                            child.data[n].forEach((c) => {
                                const matchingType = acc.find((f) => f.type === c.type);
                                // and either aggregate or add depending on whether it exists already
                                if(matchingType){
                                    matchingType.count += c.count;
                                } else {
                                    // it should exist already but in case there is missing data
                                    acc.push({type: c.type, count: c.count});
                                }
                            })
                        }
                    }
                    return acc;
                },[]))

            }
        });
        return newNode
    }

    const maxDepth = d3.max(hierarchy.descendants(), (d) => d.depth);
    // loop down through parent nodes and aggregate at each level;
    for (let i = maxDepth; i >= 0 ; i--){
        const levelNodes = descendantsByDepth.get(i);
        levelNodes.map((m) => {
            m.data = getNodeTotals(m.data.name, m.children);
        })
    }

    // update all descendants to include default color var from depth 1 descendant
    hierarchy.descendants().forEach((d) => {
        if(d.depth === 0) {
            d.data.defaultColor = "root";
        } else if (d.depth === 1){
            d.data.defaultColor = d.data[defaultColorVar];
        } else {
            const depth1Ancestor = d.ancestors().find((f) => f.depth === 1);
            d.data.defaultColor = depth1Ancestor.data[defaultColorVar];
        }
    })

    // now calculations are complete, pass back nodes and links
    const nodes = hierarchy.descendants().reduce((acc, node) => {
        const newNode = {};
        Object.keys(node.data).forEach((k) => newNode[k] = node.data[k]);
        acc.push(newNode);
        return acc;
    },[]);

    const links = chartData.edges.reduce((acc, edge) => {
        acc.push({key: edge.key, source: edge.source, target: edge.target})
        return acc;
    },[])


    return {nodeHierarchy: hierarchy, links, colorAttributes: Array.from(colorAttributes), radiusAttributes: Array.from(radiusAttributes)};

}

const measureWidth = (text, fontSize) => {
    const context = document.createElement("canvas").getContext("2d");
    context.font = `${fontSize}px Arial`;
    return context.measureText(text).width;
}


const getTooltipHtml = (d, colorVar, colorScale, defaultColor) => {
    const excludedKeys = ["label","defaultColor","_children","children","name"];
    let tooltipHTML = `<span style="font-size: 18px; color:${defaultColor ? colorScale(d.data.defaultColor) : "#484848"};"><strong>${d.data.label.toUpperCase()}</strong></span><br><br>`;
    Object.keys(d.data).forEach((k) => {
        if(!excludedKeys.includes(k)){
            if(typeof d.data[k] === "object"){
                tooltipHTML +=  `<div class="tooltipTableContainer"></div><table class="tooltipTable" style="width:100%;"><tr><td class="cellLeft"><strong>${k.toUpperCase()} </strong></td><td class="cellRight">`
                d.data[k].forEach((e) => {
                    tooltipHTML += `<span style="color:${k === colorVar ? colorScale(e.type) : "#484848"}">${e.type.substr(0,50)}: ${e.count}</span><br>`
                })
                tooltipHTML += "</td></tr></table></div>"
            } else {

                const rowColor = k === colorVar  && !defaultColor ? colorScale(d.data[k]) : "#484848";
                tooltipHTML += `<div class="tooltipTableContainer"><table class="tooltipTable" style="width:100%;"><tr style="color:${rowColor};"><td class="cellLeft"><strong>${k.toUpperCase()}</strong></td><td class="cellRight">${d.data[k]}</td></tr></table></div>`
            }

        }
    })
    tooltipHTML += "</table>"
    return tooltipHTML;
}

const zoomToBounds = (currentNodes, baseSvg, width, height,zoom) => {
    const [xExtent0, xExtent1] = d3.extent(currentNodes, (d) => d.fx || d.x);
    const [yExtent0, yExtent1] = d3.extent(currentNodes, (d) => d.fy || d.y);
    if (xExtent0 && xExtent1 && yExtent0 && yExtent1) {
        let xWidth = xExtent1 - xExtent0 + 40;
        let yWidth = yExtent1 - yExtent0 + 40;
        let translateX =  -(xExtent0 + xExtent1) / 2;
        let translateY =  -(yExtent0 + yExtent1) / 2;

        const fitToScale = 0.8 / Math.max(xWidth / width, yWidth / height);
        console.log(translateX, translateY, width/2, height/2);

            baseSvg
                .interrupt()
                .transition()
                .duration(500)
                .call(
                    zoom.transform,
                    d3.zoomIdentity
                        .translate(width / 2, height / 2)
                        .scale(fitToScale > 1 ? 1 : fitToScale)
                        .translate(fitToScale > 1 ? -width/2 : translateX, fitToScale > 1 ? -height/2 : translateY),
                );


    }
}
