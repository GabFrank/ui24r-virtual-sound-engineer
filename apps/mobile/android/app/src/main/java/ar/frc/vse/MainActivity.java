package ar.frc.vse;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // El registro va antes de super.onCreate(): el puente se construye ahí
        // y un plugin registrado después no existe para el código web.
        registerPlugin(ActualizadorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
