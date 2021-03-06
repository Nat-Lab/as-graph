(function () {
    var display = document.getElementById('display');
    var log = document.getElementById('log');

    var querybtn = document.getElementById('querybtn');
    var jumpbtn = document.getElementById('jumpbtn');
    var query = document.getElementById('query');
    var paths_filter = document.getElementById('paths_filter');
    var min_paths = document.getElementById('min_paths');

    var level = document.getElementById('level');
    var targets = document.getElementById('targets');

    var show_downstreams = document.getElementById('show_downstreams');
    var use_routeview = document.getElementById('use_routeview');
    var use_asname = document.getElementById('use_asname');
    var vertical_graph = document.getElementById('vertical_graph');
    var level_descr = document.getElementById('level_descr');
    var group_large_isps = document.getElementById('group_large_isps');

    var details = document.getElementById('details');
    var prefixinfo = document.getElementById('prefixinfo');
    var asinfo = document.getElementById('asinfo');

    var cscbtn = document.getElementById('cscbtn');
    var cpcbtn = document.getElementById('cpcbtn');

    var paths_cache = {};
    var prefixes_cache = {};
    var downstream_prefixes_cache = {};
    var routeview_cache = {};
    var asname_cache;

    try {
        show_downstreams.checked = localStorage.show_downstreams === "true";
        use_routeview.checked = localStorage.use_routeview === "true";
        use_asname.checked = localStorage.use_asname === "true";
        vertical_graph.checked = localStorage.vertical_graph === "true";
        group_large_isps.checked = localStorage.group_large_isps === "true";
        asname_cache = JSON.parse(localStorage.asname_cache);
    } catch {
        asname_cache = {};
    }

    var element;

    const large_isps = [
        "7018", "3356", "3549", "3320", "3257", "6830", "2914", "5511", "3491", "1239",
        "6453", "6762", "12956", "1299", "701", "6461", "174", "7922", "6939", "9002",
        "1273", "2828", "4134", "4837"];

    const target_descrs = [
        'Show only directly connected peers.',
        'Show only the route propagation paths to well-known ISPs.',
        'Show route propagation paths to well-known ISPs, and include all direct peers in the graph.',
        'Show only the route propagation paths to ISPs.',
        'Show route propagation paths to ISPs, and include all direct peers in the graph.',
        'Show all known propagation paths.',
        'Show route propagation paths to the given network(s).'
    ];

    const external_sources = [
        { name: 'stat.ripe.net', url: 'https://stat.ripe.net/AS' },
        { name: 'bgp.he.net', url: 'https://bgp.he.net/AS' },
        { name: 'bgp.tools', url: 'https://bgp.tools/as/' },
        { name: 'bgpview.io', url: 'https://bgpview.io/asn/' },
        { name: 'radar.qrator.net', url: 'https://radar.qrator.net/AS' },
        { name: 'whois.ipip.net', url: 'https://whois.ipip.net/AS' }
    ];

    const ignore_path = [
        (path) => false,
        (path) => !path.some(asn => large_isps.includes(asn)),
        (path) => false,
        (path) => false,
        (path) => false,
        (path) => false,
        (path) => !path.some(asn => targets.value.replace(/(as| )/gi, '').split(',').includes(asn))
    ];

    const draw_this = [
        (path, index) => index == 1,
        (path, index) => path.slice(index).some(asn => large_isps.includes(asn)),
        (path, index) => path.slice(index).some(asn => large_isps.includes(asn)) || index == 1,
        (path, index) => index != path.length - 1,
        (path, index) => index != path.length - 1 || index == 1,
        (path, index) => true,
        (path, index) => path.slice(index).some(asn => targets.value.replace(/(as| )/gi, '').split(',').includes(asn))
    ];

    jumpbtn.onclick = () => display.scrollIntoView();
    [query, targets, paths_filter, min_paths].forEach(node => node.addEventListener('keyup', e => { if (e.key === 'Enter') { querybtn.click(); } }));

    var isElementXPercentInViewport = function (el, percentVisible) {
        var rect = el.getBoundingClientRect();
        var windowHeight = (window.innerHeight || document.documentElement.clientHeight);

        return !(
            Math.floor(100 - (((rect.top >= 0 ? 0 : rect.top) / +-(rect.height / 1)) * 100)) < percentVisible ||
            Math.floor(100 - ((rect.bottom - windowHeight) / rect.height) * 100) < percentVisible
        )
    };

    var saveOptions = () => {
        localStorage.use_asname = use_asname.checked;
        localStorage.vertical_graph = vertical_graph.checked;
        localStorage.group_large_isps = group_large_isps.checked;
        localStorage.use_routeview = use_routeview.checked;
        localStorage.show_downstreams = show_downstreams.checked;
    };

    var level_change = () => {
        if (level.value === "6") targets.className = '';
        else targets.className = 'hide';
        level_descr.innerText = target_descrs[Number.parseInt(level.value)];
    }

    var lock;

    level.addEventListener('change', level_change);

    [use_routeview, show_downstreams, use_asname, vertical_graph, group_large_isps].forEach(o => o.addEventListener('change', saveOptions));

    var disable = () => {
        lock = true;
        [querybtn, cscbtn, cpcbtn, query, level, targets, show_downstreams, use_routeview, use_asname, vertical_graph, group_large_isps, paths_filter, min_paths].forEach(e => e.disabled = true);
        details.className = 'box infobox hide';
        prefixinfo.className = 'hide';
        asinfo.className = 'hide';
        peerinfo.className = 'hide';
        display.className = 'hide';
        querybtn.innerText = 'Loading...';
    };

    var enable = () => {
        lock = false;
        details.className = 'box infobox';
        display.className = '';
        [querybtn, cscbtn, cpcbtn, query, level, targets, show_downstreams, use_routeview, use_asname, vertical_graph, group_large_isps, paths_filter, min_paths].forEach(e => e.disabled = false);
        querybtn.innerText = 'Go';
    };

    var m_log = function (msg) {
        console.log(msg);
        log.innerText = `[INFO ] ${msg}\n` + log.innerText;
    }

    var m_err = function (msg) {
        console.error(msg);
        log.innerText = `[ERROR] ${msg}\n` + log.innerText;
        alert(`ERROR: ${msg}`);
    }

    var render = async function (graph) {
        querybtn.innerText = 'Rendering...';

        m_log('render: request render...');
        var viz = new Viz();
        if (element) element.remove();
        try {
            element = await viz.renderSVGElement(graph);
            element.setAttribute('width', '100%');
            element.removeAttribute('height');
            display.appendChild(element);

            jumpbtn.className = isElementXPercentInViewport(element, 10) ? 'hide' : '';

            m_log('render: done.');
        } catch (err) {
            m_err(err);
        }
    };

    var ripeGet = function (apiUrl) {
        return new Promise((resolve, reject) => {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', `https://stat.ripe.net/data/${apiUrl}`);
            xhr.onerror = () => reject('API: XHR failed. Check your input, or try again later.');
            xhr.onload = function () {
                if (this.status == 200) {
                    res = JSON.parse(xhr.response);
                    if (res.status === 'ok') resolve(res.data);
                    else reject('API: RIPE API returned not-OK.');
                } else reject('API: got non-200 response.');
            };
            xhr.send();
        });
    };

    var thirdPartyGetPaths = function (source, query) {
        querybtn.innerText = `Loading ${source} paths...`;

        return new Promise((resolve, reject) => {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', `https://api2.nat.moe/${source}.api`);
            xhr.onload = function () {
                if (this.status == 200) {
                    resolve(xhr.response.split('\n').map(p => p.split(' ').reverse()).filter(p => p.length > 1 && !p.some(p => p == 23456)));
                } else reject('API: got non-200 response.');
            };
            xhr.onerror = () => reject('API: XHR failed. Check your input, or try again later.');
            xhr.send(query.toLowerCase());
        });
    };

    var getAsNames = async function (asns) {
        querybtn.innerText = 'Loading as-names...';

        var cache_hit = {};
        var cache_missed = [];

        asns.forEach(asn => {
            if (asname_cache[asn]) cache_hit[asn] = asname_cache[asn];
            else cache_missed.push(asn);
        });

        m_log(`getAsNames: ${Object.keys(cache_hit).length} asn(s) cache hit.`);
        m_log(`getAsNames: ${cache_missed.length} asn(s) cache missed.`);
        if (cache_missed.length > 0) {
            var names = (await ripeGet(`as-names/data.json?resource=${cache_missed.join(',')}`)).names;
            localStorage.asname_cache = JSON.stringify(asname_cache = { ...asname_cache, ...names });
        }

        return { ...names, ...cache_hit };
    };

    var getDownstreamPrefixes = function(as) {
        querybtn.innerText = `Loading downstream prefixes for ${as}...`;

        return new Promise((resolve, reject) => {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', `https://api2.nat.moe/inpath.api?${as}`);
            xhr.onload = function () {
                if (this.status == 200) {
                    resolve(xhr.response.split('\n').filter(p => p.length > 1));
                } else reject('API: got non-200 response.');
            };
            xhr.onerror = () => reject('API: XHR failed. Check your input, or try again later.');
            xhr.send(as);
        });
    };

    var renderByPrefixesOrAddresses = async function (poas, as) {
        querybtn.innerText = 'Loading paths...';
        var lvl = level.value;
        var paths = [];
        as = as ? as : '';
        console.log(poas);

        if (poas.length == 1) {
            var poa = poas[0];

            document.getElementById('pfxinfo_title').innerText = poa;

            try {
                var [routing, irr, rir] = await Promise.all([
                    ripeGet(`routing-status/data.json?resource=${poa}`),
                    ripeGet(`prefix-routing-consistency/data.json?resource=${poa}`),
                    ripeGet(`rir/data.json?resource=${poa}`)
                ]);

                var origin = routing.last_seen.origin;
                origin = origin ? origin.split(',') : [];

                if (origin.length > 0) document.getElementById('pfxinfo_asn').innerText = `Announced by ${origin.map(o => `AS${o}`).join(', ')}`;
                else document.getElementById('pfxinfo_asn').innerText = `Not announced`;

                document.getElementById('pfxinfo_rir').innerText = rir.rirs[0].rir;
                var irrtable = document.getElementById('pfxinfo_irrs');
                [...document.getElementsByClassName('pfxinfo_irr_item')].forEach(i => i.remove());

                irr.routes.forEach(r => {
                    var tr = document.createElement('tr');
                    tr.className = 'pfxinfo_irr_item';
                    if (origin.includes(r.origin.toString()) && r.in_whois) tr.className += ' irr_valid';
                    if (!r.in_bgp) tr.className += ' unannounced';

                    var td_pfx = document.createElement('td');
                    td_pfx.className = 'mono';
                    var td_pfx_a = document.createElement('a');
                    td_pfx_a.href = `#${r.prefix}`;
                    td_pfx_a.onclick = () => doQuery(r.prefix);
                    td_pfx_a.innerText = r.prefix;
                    td_pfx.appendChild(td_pfx_a);
                    tr.appendChild(td_pfx);

                    var td_in_bgp = document.createElement('td');
                    td_in_bgp.innerText = r.in_bgp ? 'Yes' : 'No';
                    tr.appendChild(td_in_bgp);

                    var td_in_whois = document.createElement('td');
                    td_in_whois.innerText = r.in_whois ? 'Yes' : 'No';
                    tr.appendChild(td_in_whois);

                    var td_origin = document.createElement('td');
                    td_origin.className = 'mono';
                    var td_origin_a = document.createElement('a');
                    td_origin_a.href = `#AS${r.origin}`;
                    td_origin_a.onclick = () => doQuery(`AS${r.origin}`);
                    td_origin_a.innerText = `AS${r.origin} ${r.asn_name}`;
                    td_origin.appendChild(td_origin_a);
                    tr.appendChild(td_origin);

                    var td_irrs = document.createElement('td');
                    td_irrs.className = 'mono';
                    if (r.in_bgp) r.irr_sources.push('BGP');
                    td_irrs.innerText = r.irr_sources.join(', ');
                    tr.appendChild(td_irrs);

                    irrtable.appendChild(tr);
                });

                prefixinfo.className = '';
                peerinfo.className = '';
            } catch (err) {
                m_err(err);
            }
        }

        await Promise.all(poas.map(async poa => {
            var cache_key = `${poa}${as}`;
            try {
                m_log(`getGraphByPrefixesOrAddresses: constructing graph with prefix/IP ${poa}...`);

                m_log(`getGraphByPrefixesOrAddresses: fetching paths for ${poa} from RIPE RIS...`);
                if (!paths_cache[cache_key]) {
                    var rslt = await ripeGet(`looking-glass/data.json?resource=${poa}`);
                    var _paths = rslt.rrcs.map(rrc => rrc.peers).flat().map(peer => peer.as_path.split(' ').reverse());
                    paths = paths.concat(_paths);
                    paths_cache[cache_key] = paths;
                    m_log(`getGraphByPrefixesOrAddresses: found ${_paths.length} path(s) for ${poa} in RIPE RIS.`);
                } else {
                    var _paths = paths_cache[cache_key];
                    m_log(`getGraphByPrefixesOrAddresses: found ${_paths.length} path(s) for ${poa} in RIPE RIS (cached).`);
                    paths = paths.concat(_paths);
                }

                m_log(`getGraphByPrefixesOrAddresses: done: ${poa}.`)
            } catch (e) {
                m_err(e);
            }
        }));

        if (poas.join(',').includes('/') && use_routeview.checked) {
            // fixme
            var routeview_query = poas.join('\n');
            m_log(`getPrefixesByAs: getting paths list from routeview...`);

            var routeview_paths;
            if (!routeview_cache[routeview_query]) {
                routeview_paths = await thirdPartyGetPaths('routeview', routeview_query);
                routeview_cache[routeview_query] = routeview_paths;
                m_log(`getPrefixesByAs: done, got ${routeview_paths.length} path(s) from routeview.`);
            } else {
                routeview_paths = routeview_cache[routeview_query];
                m_log(`getPrefixesByAs: done, got ${routeview_paths.length} path(s) from routeview (cached).`);
            }

            paths = paths.concat(routeview_paths);
        }

        var peer_counts = {};
        var asns = {};
        var edges = {};

        var path_filter = paths_filter.value.replace(/(as| )/gi, '').split(',').filter(s => s != '');
        var min_paths_val = Number.parseInt(min_paths.value);
        min_paths_val = isNaN(min_paths_val) ? 25 : min_paths_val;

        paths.forEach(path => {
            if (ignore_path[lvl](path)) return;
            if (path_filter.length > 0 && !path.some(asn => path_filter.includes(asn))) return;
            var last;
            var pos = 0;
            path.forEach((asn, i, a) => {
                if (last && last != asn && draw_this[lvl](a, i)) {
                    pos++;
                    if (pos == 1) {
                        if (!peer_counts[asn]) peer_counts[asn] = 1;
                        else peer_counts[asn]++;
                    }
                    
                    if (!asns[last]) asns[last] = 1;
                    else asns[last]++;

                    if (!asns[asn]) asns[asn] = 1;
                    else asns[asn]++;
                    
                    if (!edges[`${last},${asn}`]) {
                        edges[`${last},${asn}`] = 1;
                    } else edges[`${last},${asn}`]++;
                }
                last = asn;
            });
        });

        var links = new Set();
        var isp_cluster = new Set();

        var asns_arr = Object.keys(asns);

        m_log(`getPrefixesByAs: getting names for ${asns_arr.length} asn(s).`);
        var as_names = await getAsNames(asns_arr);
        m_log(`getPrefixesByAs: done.`);

        var peerstable = document.getElementById('pfxinfo_peers');
        [...document.getElementsByClassName('pfxinfo_peer_item')].forEach(i => i.remove());

        Object.keys(peer_counts).forEach(asn => {
            var tr = document.createElement('tr');
            tr.className = 'pfxinfo_peer_item';

            var td_asn = document.createElement('td');
            td_asn.className = 'mono';
            var td_asn_a = document.createElement('a');
            td_asn_a.href = `#AS${asn}`;
            td_asn_a.onclick = () => doQuery(`AS${asn}`);
            td_asn_a.innerText = `AS${asn} ${as_names[asn]}`;
            td_asn.appendChild(td_asn_a);
            tr.appendChild(td_asn);

            var td_count = document.createElement('td');
            td_count.className = 'mono';
            td_count.innerText = peer_counts[asn];
            tr.appendChild(td_count);

            peerstable.appendChild(tr);
        });

        var nodes = new Set();

        Object.keys(edges).forEach(edge => {
            var [src, dst] = edge.split(',');
            var src_name = as_names[src].split(' ')[0];
            var dst_name = as_names[dst].split(' ')[0];
            if (edges[edge] >= min_paths_val) {
                nodes.add(src);
                nodes.add(dst);
                var line = use_asname.checked ? `"${src_name}"->"${dst_name}" [label = \"${edges[edge]}\"]` : `AS${src}->AS${dst} [label = \"${edges[edge]}\"]`;
                if (group_large_isps.checked && large_isps.includes(src)) isp_cluster.add(use_asname.checked ? `"${src_name}"` : `AS${src}`);
                if (group_large_isps.checked && large_isps.includes(dst)) isp_cluster.add(use_asname.checked ? `"${dst_name}"` : `AS${dst}`);
                links.add(line);
            }
        });

        nodes.forEach(asn => {
            if (use_asname.checked) links.add(`"${as_names[asn].split(' ')[0]}" [URL="#AS${asn}" tooltip="AS${asn}" shape=rectangle ${group_large_isps.checked && large_isps.includes(asn) ? 'style=filled' : ''}]`);
            else links.add(`AS${asn} [URL="#AS${asn}" tooltip="${as_names[asn].replace(/"/g, `\\"`)}" ${group_large_isps.checked && large_isps.includes(asn) ? 'style=filled' : ''}]`);
        });

        var graph = `digraph Propagation{${vertical_graph.checked ? '' : 'rankdir="LR";'}${Array.from(links).join(';')}${group_large_isps.checked ? `subgraph cluster{label="Large ISPs";${Array.from(isp_cluster).join(';')}}` : ''}}`;
        await render(graph);
    };

    var renderByAs = async function (as) {
        querybtn.innerText = 'Loading prefixes...';
        var format_ok = false;

        as = as.toUpperCase();

        if (/^[1-9]+[0-9]*/.test(as)) {
            as = `AS${as}`;
            format_ok = true;
        }
        if (/^AS[1-9]+[0-9]*/.test(as)) format_ok = true;
        if (!format_ok) {
            throw 'getPrefixesByAs: bad ASN.';
        }

        m_log(`getPrefixesByAs: getting prefixes list for ${as}...`);

        var prefixes;
        var downstream_prefixes = [];

        if (!prefixes_cache[as]) {
            var rslt = await ripeGet(`announced-prefixes/data.json?resource=${as}`);
            prefixes = rslt.prefixes;
            prefixes_cache[as] = prefixes;
            m_log(`getPrefixesByAs: done, found ${prefixes.length} prefix(es).`);
        } else {
            prefixes = prefixes_cache[as];
            m_log(`getPrefixesByAs: done, found ${prefixes.length} prefix(es) (cached).`);
        }

        if (show_downstreams.checked) {
            paths_filter.value = as;
            if (!downstream_prefixes_cache[as]) {
                downstream_prefixes = await getDownstreamPrefixes(as);
                downstream_prefixes_cache[as] = downstream_prefixes;
                m_log(`getPrefixesByAs: done, found ${downstream_prefixes.length} downstream prefix(es).`);
            } else {
                downstream_prefixes = downstream_prefixes_cache[as];
                m_log(`getPrefixesByAs: done, found ${downstream_prefixes.length} downstream prefix(es) (cached).`);
            }
        }

        var prxtable = document.getElementById('asninfo_announced');
        [...document.getElementsByClassName('asninfo_announced_item')].forEach(i => i.remove());
        prefixes.forEach(prefix => {
            var tr = document.createElement('tr');
            tr.className = 'asninfo_announced_item';

            var td = document.createElement('td');
            td.className = 'mono';
            var a = document.createElement('a');
            a.href = `#${prefix.prefix}`;
            a.onclick = () => doQuery(prefix.prefix);
            a.innerText = prefix.prefix;
            td.appendChild(a);
            tr.appendChild(td);

            var td_start = document.createElement('td');
            td_start.className = 'mono';

            var td_end = document.createElement('td');
            td_end.className = 'mono';

            if (prefix.timelines.length > 0) {
                var tl = prefix.timelines[0];
                td_start.innerText = tl.starttime;
                td_end.innerText = tl.endtime;
            }

            tr.appendChild(td_start);
            tr.appendChild(td_end);

            prxtable.appendChild(tr);
        });

        if (prefixes.length > 1) {
            document.getElementById('asinfo_title').innerText = as;
            document.getElementById('asinfo_asn').innerText = as;

            var asinfo_ext_sources = document.getElementById('asinfo_ext_sources');
            asinfo_ext_sources.innerText = '';
            external_sources.forEach(source => {
                var a = document.createElement('a');
                a.innerText = source.name;
                a.target = '_blank';
                a.href = `${source.url}${as.replace('AS', '')}`;
                asinfo_ext_sources.appendChild(a);
                asinfo_ext_sources.appendChild(document.createTextNode(' '));
            });
            asinfo.className = '';
            peerinfo.className = '';
        }

        if (prefixes.length > 200) {
            if (!confirm(`${as} has a large number of routes (${prefixes.length}), are you sure you want to proceed? Continuing may cause your browser to hang.`)) {
                m_log('getPrefixesByAs: aborted.');
                return;
            }
        }

        await renderByPrefixesOrAddresses(prefixes.map(p => p.prefix), as);
        if (downstream_prefixes.length > 0 && downstream_prefixes.length <= 5000) {
            await renderByPrefixesOrAddresses(downstream_prefixes);
        }

        if (downstream_prefixes.length > 5000) {
            alert(`cannot determine downstreams of ${as}; it might be a feeder to one of the collectors, or have too many downstreams.`);
        }
    };

    var doQuery = async function (target) {
        if (lock) return; // fixme

        disable();
        if (target) {
            window.location.hash = `${target}`;
        }
        try {
            var hash = window.location.hash.replace('#', '').toUpperCase();
            if (hash != "") {
                query.value = hash;
                if (/^AS[1-9]+[0-9]*$/.test(hash)) await renderByAs(hash);
                else if (/^[1-9]+[0-9]*$/.test(hash)) await renderByAs(`AS${hash}`);
                else await renderByPrefixesOrAddresses([hash]);
            }
        } catch (err) {
            m_err(err);
        }
        enable();
    };

    querybtn.onclick = () => {
        doQuery(query.value)
    };

    document.body.onload = async () => {
        level_change();
        m_log('ready.');
        doQuery();

        var local = await ripeGet('my-network-info/data.json');
        var local_info = document.getElementById('local_info');
        var ext_sources = document.getElementById('ext_sources');
        var l_pfx_btn = document.getElementById('lpfxbtn');
        var l_asn_btn = document.getElementById('lasnbtn');

        var local_asn = `AS${local.asns[0]}`;

        l_pfx_btn.innerText = local.address;
        l_pfx_btn.href = `#${local.prefix}`;
        l_pfx_btn.onclick = () => doQuery(local.prefix);

        l_asn_btn.innerText = local_asn;
        l_asn_btn.href = `#${local_asn}`;
        l_asn_btn.onclick = () => doQuery(local_asn);

        external_sources.forEach(source => {
            var a = document.createElement('a');
            a.innerText = source.name;
            a.target = '_blank';
            a.href = `${source.url}${local.asns[0]}`;
            ext_sources.appendChild(a);
            ext_sources.appendChild(document.createTextNode(' '));
        });

        local_info.className = 'control';
    }

    cscbtn.onclick = () => {
        prefixes_cache = {};
        downstream_prefixes_cache = {};
        paths_cache = {};
        isolario_cache = {};
        routeview_cache = {};
        asname_cache = {};
        localStorage.asname_cache = undefined;
        m_log('Cached entries removed.');
    };

    cpcbtn.onclick = () => {
        asname_cache = {};
        localStorage.asname_cache = undefined;
        m_log('Cached entries removed.');
    };

    window.onhashchange = () => doQuery();

})();