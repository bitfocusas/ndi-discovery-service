const net = require('net');
const xml2js = require('xml2js');

const connections = [];
let sources = [];
const listeners = [];

const server = net.createServer((conn) => {
	console.log("Connection from ", conn.remoteAddress);
	connections.push(conn);
	conn.myBuffer = Buffer.from("")

	function sendQueryResponse() {
		console.log("sendQueryResponse()")
		const builder = new xml2js.Builder({ headless: true });
		let obj = { sources: sources.map(source => ({ source: source.source })) };
		let xml = builder.buildObject(obj);
		conn.write(xml + '\0');
	}

	function publishAddSource(source) {
		console.log("publishAddSource()", source)
		const builder = new xml2js.Builder({ headless: true });
		let obj = { 'add_source': {  source } };
		let xml = builder.buildObject(obj);
		listeners.forEach(listener => {
			listener.write(xml + '\0');
		});
	}

	function publishRemoveSource(source) {
		console.log("publishRemoveSource", source)
		const builder = new xml2js.Builder({ headless: true });
		let obj = { 'remove_source': {  source } };
		let xml = builder.buildObject(obj);
		listeners.forEach(listener => {
			listener.write(xml + '\0');
		});
	}

	function closeConnection(conn) {
		console.log("closeConnection()",conn)
		let idx = connections.indexOf(conn);
		if (idx > -1) {
			connections.splice(idx, 1);
		}

		idx = listeners.indexOf(conn);
		if (idx > -1) {
			listeners.splice(idx, 1);
		}

		sources.filter(item => item.socket === conn).forEach(item => {
			publishRemoveSource(item.source);
		});

		sources = sources.filter(item => item.socket !== conn);
	}

	function handleData(data) {
		console.log("handleData", data);
		const info = data.toString().replace(/\x0/g, '');

		xml2js.parseString(info, (err, res) => {
			if (err) {
				console.error('Error parsing: %o: %o', info, err);
				conn.close();
				return;
			}

			if (res.query !== undefined && listeners.indexOf(conn) === -1) {
				listeners.push(conn);
				sendQueryResponse();
				return;
			}

			if (res.source) {

				let allowed = true;

				if (res.source.address && res.source.address.length > 0 && res.source.address[0] === '0.0.0.0') {
					res.source.address[0] = conn.remoteAddress.replace(/^::ffff:/,'');
				}
				console.log("YAY 0")
				if (res.source.name !== undefined && res.source.name[0] !== undefined) {

					const match = res.source.name[0].match(/^(.+) \((.+)\)$/);
					console.log("YAY 1")
					if (match !== null && res.source.address !== undefined) {	
						console.log("YAY 2")
						let addr = res.source.address[0] || '';
						let [ all, host, label ] = match;
						
						let location = "ILLEGAL"
						if (addr.match(/^10\.20\.102\./)) location = "OSS"
						else if (addr.match(/^10\.20\.30\./)) location = "SERVER"
						else if (addr.match(/^10\.20\.10\./)) location = "TMLB"
						else if (addr.match(/^10\.40\./)) location = "EXT OB"
						else if (addr.match(/^10\.47\./)) location = "NLTV"
						
						host = host.replace(/\.LOCAL/,"");

						if (label === 'Decoding Channel') allowed = false;
						let loc = '[' + location.toUpperCase() + "] " + host.toUpperCase()
						res.source.name[0] = `${loc} (${label})`

						console.log("NEW NAME IS", res.source.name[0]);

					}

				}
			
				if (allowed) {
					sources.push({
						source: res.source,
						socket: conn,
						ts: Date.now()
					});
					publishAddSource(res.source);
				}
			}

			console.log("xml parsed to: ", res);

		});
	}

	function checkBuffer() {
		console.log("checkBuffer()")
		let idx;
		while ((idx = conn.myBuffer.indexOf('\0')) > -1) {
			handleData(conn.myBuffer.slice(0, idx));
			conn.myBuffer = conn.myBuffer.slice(idx+1);
			console.log("New buffer: %o", conn.myBuffer);
		}
	}

	conn.on('data', (data) => {
		console.log("conn.on(data):", data);
		conn.myBuffer = Buffer.concat([conn.myBuffer, data]);
		checkBuffer();
	});

	conn.on('error', (e) => {
		console.log("error")
		console.log("Socket err: ", e);
		closeConnection(conn);
	});

	conn.on('close', () => {
		closeConnection(conn);
	});
});
server.listen(5959);

setInterval(() => {
	console.log("Sources: %o, Listeners: %o, Connections: %o", sources.length, listeners.length, connections.length);
}, 1000);
