require('dotenv').config({path:'.env.local',quiet:true});
if (!process.env.VUTRU_ACCESS_TOKEN || process.env.VUTRU_ACCESS_TOKEN.length < 32) { console.error('Đặt VUTRU_ACCESS_TOKEN có ít nhất 32 ký tự trong .env.local trước khi mở LAN.');process.exit(1); }
require('./build-workers.cjs');
const child=require('child_process').spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev','-H','0.0.0.0','-p','3001'],{stdio:'inherit',windowsHide:true,env:process.env});child.on('exit',code=>process.exit(code||0));
