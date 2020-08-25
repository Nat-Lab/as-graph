(function () {
    var paths_cache = {};
    var prefixes_cache = {};
    var isolario_cache = {};
    var asname_cache;

    try {
        asname_cache = JSON.parse(localStorage.asname_cache);
    } catch {
        asname_cache = {};
    }

    var element;
    var display = document.getElementById('display');
    var log = document.getElementById('log');

    var querybtn = document.getElementById('querybtn');
    var query = document.getElementById('query');

    var level = document.getElementById('level');
    var targets = document.getElementById('targets');
    var use_isolario = document.getElementById('use_isolario');
    var use_asname = document.getElementById('use_asname');

    const large_isps = [
        "7018", "3356", "3549", "3320", "3257", "6830", "2914", "5511", "3491", "1239",
        "6453", "6762", "12956", "1299", "701", "6461", "174", "7922", "6939", "9002",
        "1273", "2828", "4134", "4837"];

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

    level.addEventListener('change', function () {
        if (this.value === "6") targets.className = '';
        else targets.className = 'hide';
    });

    query.addEventListener('keyup', e => { if (e.key === "Enter") { querybtn.click(); } } );
    targets.addEventListener('keyup', e => { if (e.key === "Enter") { querybtn.click(); } } );

    var disable = () => {
        [querybtn, query, level].forEach(e => e.disabled = true);
    };
    var enable = () => {
        [querybtn, query, level].forEach(e => e.disabled = false);
    };

    var m_log = function(msg) {
        console.log(msg);
        log.innerText = `[INFO ] ${msg}\n` + log.innerText;
    }

    var m_err = function(msg) {
        console.error(msg);
        log.innerText = `[ERROR] ${msg}\n` + log.innerText;
    }

    var render = async function (graph) {
        m_log('render: request render...');
        var viz = new Viz();
        if (element) element.remove();
        try {
            element = await viz.renderSVGElement(graph);
            element.setAttribute('width', '100%');
            element.removeAttribute('height');
            display.appendChild(element);
            m_log('render: done.');

        } catch(err) {
            m_err(err);
        }
    };

    var ripeGet = function (apiUrl) {
        return new Promise((resolve, reject) => {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', `https://stat.ripe.net/data/${apiUrl}`);
            xhr.send();
            xhr.onload = function () {
                if (this.status == 200) {
                    res = JSON.parse(xhr.response);
                    if (res.status === 'ok') resolve(res.data);
                    else reject('API: RIPE API returned not-OK.');
                } else reject('API: got non-200 response.');
            };
        });
    }

    var isolarioGetPaths = function (query) {
        return new Promise((resolve, reject) => {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', `https://api2.nat.moe/isolario.api`);
            xhr.send(query.toLowerCase());
            xhr.onload = function () {
                if (this.status == 200) {
                    resolve(xhr.response.split('\n').map(p => p.split(' ').reverse()).filter(p => p.length > 1 && !p.some(p => p == 23456)));
                } else reject('API: got non-200 response.');
            };
        });
    };

    var getAsNames = async function (asns) {
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

    var renderByPrefixesOrAddresses = async function (poas) {
        var lvl = level.value;
        var paths = [];

        await Promise.all(poas.map(async poa => {
            try {
                m_log(`getGraphByPrefixesOrAddresses: constructing graph with prefix/IP ${poa}...`);

                m_log(`getGraphByPrefixesOrAddresses: fetching paths for ${poa} from RIPE RIS...`);
                if (!paths_cache[poa]) {
                    var rslt = await ripeGet(`looking-glass/data.json?resource=${poa}`);
                    var _paths = rslt.rrcs.map(rrc => rrc.peers).flat().map(peer => peer.as_path.split(' ').reverse());
                    paths = paths.concat(_paths);
                    paths_cache[poa] = paths;
                    m_log(`getGraphByPrefixesOrAddresses: found ${_paths.length} path(s) for ${poa} in RIPE RIS.`);
                } else {
                    var _paths = paths_cache[poa];
                    m_log(`getGraphByPrefixesOrAddresses: found ${_paths.length} path(s) for ${poa} in RIPE RIS (cached).`);
                    paths = paths.concat(_paths);
                }

                m_log(`getGraphByPrefixesOrAddresses: done: ${poa}.`)
            } catch (e) {
                m_err(e);
            }
        }));

        if (poas.join(',').includes('/') && use_isolario.checked) {
            // fixme
            var isolario_query = poas.join('\n');
            m_log(`getPrefixesByAs: getting paths list from isolario...`);

            var isolario_paths;
            if (!isolario_cache[isolario_query]) {
                isolario_paths = await isolarioGetPaths(isolario_query);
                isolario_cache[isolario_query] = isolario_paths;
                m_log(`getPrefixesByAs: done, got ${isolario_paths.length} path(s) from isolario.`);
            } else {
                isolario_paths = isolario_cache[isolario_query];
                m_log(`getPrefixesByAs: done, got ${isolario_paths.length} path(s) from isolario (cached).`);
            }

            paths = paths.concat(isolario_paths);
        }
    
        var asns = new Set();
        var edges = new Set();

        paths.forEach(path => {
            if (ignore_path[lvl](path)) return;

            var last;

            path.forEach((asn, i, a) => {
                if (last && last != asn && draw_this[lvl](a, i)) {
                    asns.add(last);
                    asns.add(asn);
                    edges.add(`${last},${asn}`);
                }
                last = asn;
            });
        });

        var links = new Set();

        var asns_arr = Array.from(asns);

        m_log(`getPrefixesByAs: getting names for ${asns_arr.length} asn(s).`);
        var as_names = await getAsNames(asns_arr);
        m_log(`getPrefixesByAs: done.`)

        edges.forEach(edge => {
            var [src, dst] = edge.split(',');
            if (use_asname.checked) {
                var src_naeme = as_names[src].split(' ')[0];
                var dst_name = as_names[dst].split(' ')[0];
                links.add(`"${src_naeme}"->"${dst_name}"`);
            }
            else links.add(`AS${src}->AS${dst}`);
        });

        asns_arr.forEach(asn => {
            if (use_asname.checked) links.add(`"${as_names[asn].split(' ')[0]}" [URL="https://bgp.he.net/AS${asn}" tooltip="AS${asn}" shape=rectangle]`);
            else links.add(`AS${asn} [URL="https://bgp.he.net/AS${asn}" tooltip="${as_names[asn].replace(/"/g, `\\"`)}"]`);
        });

        var graph = `digraph{rankdir="LR";${Array.from(links).join(';')}}`;
        render(graph);
    };

    var renderByAs = async function (as) {
        var format_ok = false;

        as = as.toUpperCase();

        if(/^[1-9]+[0-9]*/.test(as)) {
            as = `AS${as}`;
            format_ok = true;
        }
        if (/^AS[1-9]+[0-9]*/.test(as)) format_ok = true;
        if (!format_ok) {
            throw 'getPrefixesByAs: bad ASN.';
        }

        m_log(`getPrefixesByAs: getting prefixes list for ${as}...`);

        var prefixes;

        if (!prefixes_cache[as]) {
            var rslt = await ripeGet(`announced-prefixes/data.json?resource=${as}`);
            prefixes = rslt.prefixes.map(p => p.prefix);
            prefixes_cache[as] = prefixes;
            m_log(`getPrefixesByAs: done, found ${prefixes.length} prefix(es).`);
        } else {
            prefixes = prefixes_cache[as];
            m_log(`getPrefixesByAs: done, found ${prefixes.length} prefix(es) (cached).`);
        }

        if (prefixes.length > 200) {
            if (!confirm(`${as} has a large number of routes (${prefixes.length}), are you sure you want to proceed? Continuing may cause your browser to hang.`)) {
                m_log('getPrefixesByAs: aborted.');
                return;
            }
        }

        renderByPrefixesOrAddresses(prefixes);
    };

    var doQuery = (target) => {
        disable();
        if (target) {
            window.location.hash = `${target}`;
        }
        try {
            var hash = window.location.hash.replace('#', '').toUpperCase();
            if (hash != "") {
                query.value = hash;
                if (/^AS[1-9]+[0-9]*$/.test(hash)) renderByAs(hash);
                else if (/^[1-9]+[0-9]*$/.test(hash)) renderByAs(`AS${hash}`);
                else renderByPrefixesOrAddresses([hash]);
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

    document.getElementById('ccbtn').onclick = () => {
        prefixes_cache = {};
        paths_cache = {};
        isolario_cache = {};
        m_log('Cached entries removed.');
    };
})();