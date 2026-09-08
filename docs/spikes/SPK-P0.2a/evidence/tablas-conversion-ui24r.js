// Tablas de conversion de la Soundcraft Ui24R, firmware 3.4.8318-ui24
// Extraidas literalmente de http://192.168.0.49/mixer.html el 2026-09-08.
// Es el codigo que la propia consola sirve: no son valores medidos ni inferidos,
// es la conversion que usa su interfaz oficial. Resuelve el paso 2 de SPK-P0.2b.
// Convencion: "V" es el valor crudo del protocolo, normalizado 0..1.

// --- auxiliares y tablas de las que dependen las conversiones ---
ui24pgains=[-5,-5,-3,-3,-1,-1,1,1,3,3,5,5,7,7,9,9,11,11,13,13,15,15,17,17,19,19,21,21,23,23,25,25,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58];
pgains=[-5,-5,-3,-3,-1,-1,1,1,3,3,5,5,7,7,9,9,11,11,13,13,15,15,17,17,19,19,21,21,23,23,25,25,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58];
function bound(a,b,c){return a<b?b:a>c?c:a}
function precision(a,b){if(0==b)return a|0;if(1==b)return(10*a|0)/10;if(2==b)return(100*a|0)/100;var c=Math.pow(10,b);return(a*c|0)/c}

const zeroDbPos = 0.7647058823529421;  // posicion de fader de 0 dB

function VtoLIN(a){return 2.676529517952372E-4*Math.exp(a*(23.90844819639692+a*(-26.23877598214595+(12.195249692570245-.4878099877028098*a)*a)))*(.055>a?Math.sin(28.559933214452666*a):1)}

function VtoDB(a){var b=VtoLIN(a);.001>a?a="- @ ":(b=(20*Math.log(b)/Math.log(10)*10+.45|0)/10,-20>=b?b=""+(b|0):-1==(""+b).indexOf(".")&&(b+=".0"),a=b+" dB",-120>b&&(this.text="- @ "));return a}

function VtoDB2(a){var b=VtoLIN(a);.001>a?a="-inf":(b=(20*Math.log(b)/Math.log(10)*10+.45|0)/10,-20>=b?b=""+(b|0):-1==(""+b).indexOf(".")&&(b+=".0"),a=b,-120>b&&(this.text="-inf"));return a}

function VtoDBf(a){a=VtoLIN(a);return 1E-10>a?-200:20*Math.log(a)/Math.log(10)}

function VtoDBf3(a){a=VtoLIN(a);return(20*Math.log(a)/Math.log(10)*10+.45|0)/10}

function DBtoVf(a){if(-200>=a)return 0;if(10<=a)return 1;a=Math.pow(10,a/20);for(var b=0,c=1,d=0;128>d;d++){var f=.5*(b+c),e=VtoLIN(f);if(1E-10>Math.abs(e-a))return f;e>a?c=f:b=f}return.5*(b+c)}

function DBtoVf2(a){return findV(VtoDBf3,a)}

function VtoGAIN24(a){a=64*a|0;0>a&&(a=0);63<a&&(a=63);return ui24pgains[a]-1}

function GAIN24toV(a){return bound((a+6)/63,0,1)}

function VtoGAINP(a){return 90*a-40}

function GAINPtoV(a){return bound((a+40)/90,0,1)}

function VtoPAN(a){return 200*a-100|0}

function PANtoV(a){return bound((a+100)/200,0,1)}

function VtoFREQ(a){return Math.round(20*Math.pow(1102.5,a))}

function VtoFREQ20(a){return Math.round(20*Math.pow(1E3,a))}

function FREQtoV(a){return bound(Math.log(a/20)/Math.log(1102.5),0,1)}

function FREQtoX(a,b){return(b-1)*Math.log(a/20)/Math.log(1102.5)}

function VtoHPFfreq(a){return 0==a?lang.OFF:VtoFREQ(a)}

function VtoLPFfreq(a){return 1==a?lang.OFF:VtoFREQ(a)}

function VtoQ(a){return.05*Math.pow(300,a)}

function QtoV(a){return bound(Math.log(a/.05)/Math.log(300),0,1)}

function VtoEQGAIN15(a){return precision(30*a-15,1)}

function VtoEQGAIN20(a){return 40*a-20}

function VtoTHRESH(a){return precision(-90+96*a,1)}

function VtoRATIO(a){return 1/a}

function RATIOtoV(a){return 1E-4>a?1:bound(1/a,0,1)}

function VtoATTACK(a){return 1*Math.pow(400,desqr(a))|0}

function VtoREL(a){return 10*Math.pow(200,desqr(a))|0}

function VtoDYNGAIN(a){return 96*a-72|0}

function VtoDYNOUTGAIN(a){return 72*a-24}

function VtoGATE_THRESH(a){return 96*a-90}

function VtoGATE_DEPTH(a){return 60*a-60}

function VtoGATE_ATTACK(a){return 1*Math.pow(400,desqr(a))}

function VtoGATE_HOLD(a){return 1*Math.pow(2E3,desqr(a))}

function VtoGATE_RELEASE(a){return 5*Math.pow(400,desqr(a))}

function VtoDYNGATE(a){return precision(-90+96*a,1)}

function VtoDS_RATIO(a){1E-5>a&&(a=1E-5);a=VtoRATIO_DE(a);return a=60<a?"∞":2>a?precision(a,2)+"":precision(a,1)+""}

function VtoRATIO_DE(a){return 1/a}

function DeesserVtoFREQ(a){return 2E3*Math.pow(7.5,a)}

function VtoPREDELAY(a){return a*a*50}

function PREDELAYtoV(a){return Math.sqrt(a/.05)}

function VtoPREDELAYLED(a){a=a*a*50;return 1>a?precision(a,1):a|0}

function VtoDETUNE(a){return-100+200*a|0}

function VtoLATENCY(a){return 0==a?"0"+lang.MS:a<=47/SAMPLE_RATE?Math.round(SAMPLE_RATE*a)+lang.SMPL:precision(1E3*a,1)+lang.MS}

function VtoPERCENT(a){return 100*a|0}

function VtoLINRANGE(a,b,c){return a*(c-b)+b}

function VtoLOGRANGE(a,b,c){return Math.round(b*Math.pow(c,a))}

function VtoVMIX_TIME(a){return.02+3.98*Math.pow(a,3.0517)}

function VtoVMIX_TIME_MS(a){return parseInt(1E3*VtoVMIX_TIME(a)+.5)}

function VtoVMIX_WEIGHT(a){return-12+24*a}

function VMIX_TIMEtoV(a){return.6359553000113926*Math.pow(-.02+a,.3276862076875184)}

function VMIX_WEIGHTtoV(a){return 1/24*(12+a)}

function deconvertVU(a){return.004167508166392142*a}

function deconvertVU_comp(a){a=(1-.004167508166392142*(a|a>>7&1))*COMP_ZOOM;.008>a?a=0:1<a&&(a=1);return a}
