const net = require('net');
const xml2js = require('xml2js');

const connections = [];
let sources = [];
const listeners = [];

const server = net.createServer((conn) => {
	conn.setKeepAlive(60000); // make sure connections are timed out if interrupted
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
		console.log("closeConnection()")
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
		console.log("handleData (%o bytes)", data.length);
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
				if (res.source.name !== undefined && res.source.name[0] !== undefined) {

					const match = res.source.name[0].match(/^(.+) \((.+)\)$/);
					if (match !== null && res.source.address !== undefined) {	
						let addr = res.source.address[0] || '';
						let [ all, host, label ] = match;
						
						if (addr.match(/^10\.20\.102\.118/)) {
							sources.push({
								source: res.source,
								socket: conn,
								ts: Date.now()
							});
							publishAddSource(res.source);
							return;
						}

						let location = "ILLEGAL"
						if (addr.match(/^10\.20\.10[123456789]\./)) location = "OSS"
						else if (addr.match(/^10\.20\.12[123456789]\./)) location = "TMCV"
						else if (addr.match(/^10\.20\.30\./)) location = "UV89"
						else if (addr.match(/^10\.20\.10\./)) location = "TMLB"
						else if (addr.match(/^10\.40\.10\./)) location = "TMLB OBR1"
						else if (addr.match(/^10\.40\.20\./)) location = "TMLB OBR2"
						else if (addr.match(/^10\.40\.30\./)) location = "TMLB OBR3"
						else if (addr.match(/^10\.40\.40\./)) location = "TMLB OBR4"
						else if (addr.match(/^10\.40\.50\./)) location = "TMLB OBR5"
						else if (addr.match(/^10\.40\.60\./)) location = "TMLB OBR6"
						else if (addr.match(/^10\.40\.70\./)) location = "TMLB OBR7"
						else if (addr.match(/^10\.40\.80\./)) location = "TMLB OBR8"
						else if (addr.match(/^10\.40\.91\./)) location = "TMLB OBA1"
						else if (addr.match(/^10\.40\.92\./)) location = "TMLB OBA2"
						else if (addr.match(/^10\.40\.93\./)) location = "TMLB OBA3"
						else if (addr.match(/^10\.40\.94\./)) location = "TMLB OBA4"
						else if (addr.match(/^10\.40\.95\./)) location = "TMLB OBA5"
						else if (addr.match(/^10\.40\.96\./)) location = "TMLB OBA6"
						else if (addr.match(/^10\.40\.97\./)) location = "TMLB OBA7"
						else if (addr.match(/^10\.40\.98\./)) location = "TMLB OBA8"
						else if (addr.match(/^10\.40\.99\./)) location = "TMLB OBA9"
						else if (addr.match(/^10\.40\.220\./)) location = "TMLB OBC1"
						else if (addr.match(/^10\.40\.221\./)) location = "TMLB TCR1"
						else if (addr.match(/^10\.40\.222\./)) location = "TMLB TCR2"
						else if (addr.match(/^10\.47\.1\./)) location = "NLTV-R1"
						else if (addr.match(/^10\.40\./)) location = "TMLB EXT"
						else if (addr.match(/^10\.47\./)) location = "NLTV EXT"
						else if (addr.match(/^80.241.92.21[59]/)) location = "UV89"
						
						host = host.replace(/\.LOCAL/,"");

						if (label === 'Decoding Channel') allowed = false;
						let loc = location.toUpperCase() + " - " + host.toUpperCase()
						res.source.name[0] = `${loc} (${label})`
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

		});
	}

	function checkBuffer() {
		console.log("checkBuffer()")
		let idx;
		while ((idx = conn.myBuffer.indexOf('\0')) > -1) {
			handleData(conn.myBuffer.slice(0, idx));
			conn.myBuffer = conn.myBuffer.slice(idx+1);
		}
	}

	conn.on('data', (data) => {
		console.log("conn.on(data): %o bytes", data.length);
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
