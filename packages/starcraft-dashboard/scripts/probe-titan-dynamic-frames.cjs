#!/usr/bin/env node

const { chromium } = require( "playwright" );

const url = process.argv[2] ?? "http://127.0.0.1:9120/?titan=1";
const race = process.argv[3] ?? "Terran";

const sleep = ( ms ) => new Promise( ( resolve ) => setTimeout( resolve, ms ) );

const sample = async ( page ) => page.evaluate( () => {
    const actions = globalThis.__hermesUnitVisualActions;
    const actionRows = actions instanceof Map
        ? Array.from( actions.entries() ).map( ( [unitId, action] ) => ( {
            unitId,
            kind: action.kind,
            resource: action.resource ?? null,
        } ) )
        : [];
    const actionUnitIds = new Set( actionRows.map( ( row ) => row.unitId ) );
    const imageStore = globalThis.__hermesImages;
    const spriteStore = globalThis.__hermesSprites;
    const images = imageStore && typeof imageStore[Symbol.iterator] === "function"
        ? Array.from( imageStore ).map( ( image ) => {
            const unit = typeof imageStore.getUnit === "function" ? imageStore.getUnit( image ) : undefined;
            const action = unit ? actions.get( unit.id ) : undefined;
            return {
                unitId: unit?.id ?? null,
                typeId: unit?.typeId ?? null,
                action: action?.kind ?? null,
                resource: action?.resource ?? null,
                imageIndex: image.userData?.imageIndex ?? null,
                frame: image.frame ?? null,
                frameCount: image.frames?.length ?? null,
                atlasImageIndex: image.atlas?.imageIndex ?? null,
                is3d: !!image.isImage3d,
                visible: !!image.visible,
            };
        } ).filter( ( row ) => row.visible && row.unitId != null )
        : [];
    const markers = spriteStore && typeof spriteStore[Symbol.iterator] === "function"
        ? Array.from( spriteStore ).map( ( sprite ) => {
            const marker = sprite.userData?.hermesCarryMarker;
            return marker ? {
                spriteTypeId: sprite.userData?.typeId ?? null,
                visible: !!marker.visible,
                x: marker.position?.x ?? null,
                y: marker.position?.y ?? null,
                z: marker.position?.z ?? null,
            } : null;
        } ).filter( Boolean ).filter( ( row ) => row.visible ).slice( 0, 12 )
        : [];
    return {
        completedRender: !!globalThis.__hermesCompletedRenderMode,
        actions: actionRows.slice( 0, 12 ),
        images: images.slice( 0, 24 ),
        markers,
    };
} );

( async () => {
    const browser = await chromium.launch( { headless: true } );
    const page = await browser.newPage( { viewport: { width: 1280, height: 900 } } );
    page.on( "console", ( msg ) => {
        const text = msg.text();
        if ( /hermes|scene-composer|world-composer|error/i.test( text ) ) {
            console.log( `[browser:${msg.type()}] ${text}` );
        }
    } );

    await page.goto( url, { waitUntil: "domcontentloaded", timeout: 60_000 } );
    await page.waitForSelector( "iframe", { timeout: 60_000 } );
    const frame = await page.waitForFunction(
        () => Array.from( document.querySelectorAll( "iframe" ) )
            .map( ( iframe ) => iframe.src )
            .find( ( src ) => src.includes( "127.0.0.1:3344" ) ),
        null,
        { timeout: 60_000 }
    ).then( async ( handle ) => {
        const src = await handle.jsonValue();
        return page.frame( { url: src } );
    } );
    if ( !frame ) throw new Error( "Could not find Titan iframe" );

    await frame.getByRole( "button", { name: new RegExp( `Select ${race}`, "i" ) } ).click( { timeout: 60_000 } );
    await frame.waitForFunction( () => !!globalThis.__hermesImages, null, { timeout: 120_000 } );
    await frame.waitForFunction(
        () => globalThis.__hermesUnitVisualActions instanceof Map && globalThis.__hermesUnitVisualActions.size > 0,
        null,
        { timeout: 120_000 }
    );

    const samples = [];
    for ( let i = 0; i < 5; i++ ) {
        samples.push( await sample( frame ) );
        await sleep( 700 );
    }

    await browser.close();
    console.log( JSON.stringify( samples, null, 2 ) );
} )().catch( ( err ) => {
    console.error( err );
    process.exitCode = 1;
} );

