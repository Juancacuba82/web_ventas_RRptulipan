document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Toggle
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav-links');
    const navLinks = document.querySelectorAll('.nav-links li');

    burger.addEventListener('click', () => {
        nav.classList.toggle('nav-active');
        navLinks.forEach((link, index) => {
            if (link.style.animation) {
                link.style.animation = '';
            } else {
                link.style.animation = `navLinkFade 0.5s ease forwards ${index / 7 + 0.3}s`;
            }
        });
        burger.classList.toggle('toggle');
    });

    // Language Logic
    let currentLang = 'en';
    const langSwitch = document.getElementById('lang-switch');

    const translations = {
        en: {
            "nav-home": "Home",
            "nav-services": "Services",
            "nav-about": "About Us",
            "nav-gallery": "Gallery",
            "nav-contact": "Contact",
            "hero-title": "Modern Container Solutions",
            "hero-p": "Global logistics made simple. We sell, rent, and transport high-quality containers tailored to your business needs.",
            "hero-btn-services": "Our Services",
            "hero-btn-quote": "Get an Instant Quote.",
            "services-title": "Our Services",
            "service-sales-h3": "Container Sales",
            "service-sales-p": "Looking for a permanent solution? We offer a wide range of new and used shipping containers for sale.",
            "service-sales-btn": "Buy",
            "service-rent-h3": "Container Rentals",
            "service-rent-p": "Flexible rental options for short and long-term storage needs. Reliable and secure containers at your disposal.",
            "service-rent-btn": "Rent",
            "service-trans-h3": "Transportation",
            "service-trans-p": "Fast and safe transportation services. We deliver your containers to any location with precision and care.",
            "service-trans-btn": "Quote",
            "about-h2": "Why Choose RP Tulipan?",
            "about-p": "With years of experience in the logistics industry, we pride ourselves on providing top-tier container solutions. Our commitment to quality and customer satisfaction makes us a leader in the market.",
            "about-f1": "High-quality steel containers",
            "about-f2": "Competitive market pricing",
            "about-f3": "24/7 Customer support",
            "about-f4": "Global delivery network",
            "contact-h2": "Contact Us",
            "contact-h3": "Get in Touch",
            "contact-p": "Have questions about our services? Our team is ready to help you find the perfect container solution.",
            "contact-address": "9804 NW 80th Ave, Hialeah Gardens FL 33016, United States",
            "form-name": "Your Name",
            "form-email": "Your Email",
            "form-service-placeholder": "Select Service",
            "form-service-sales": "Container Sales",
            "form-service-rent": "Container Rentals",
            "form-service-trans": "Transportation",
            "form-message": "Your Message",
            "form-btn": "Send Message",
            "footer-p": "Providing excellence in container logistics.",
            "footer-links-h4": "Quick Links",
            "footer-social-h4": "Follow Us",
            "footer-bottom": "&copy; 2026 RP Tulipan Logistics. All rights reserved.",
            "gallery-h1": "Our Photo Gallery",
            "gallery-p": "Explore our containers and logistics operations",
            "buy-h1": "Configure Your Container",
            "buy-p": "Select the options that best fit your needs",
            "buy-step1": "1. Select Size",
            "buy-step2": "2. Select Condition",
            "buy-step3": "3. Climatización",
            "buy-summary": "Summary",
            "buy-btn-pricing": "Get Pricing",
            "buy-btn-restart": "Restart",
            "buy-back": "Back",
            "buy-back-home": "Back to Services",
            "buy-opt-20": "20' Standard",
            "buy-opt-40": "40' High Cube",
            "buy-opt-45": "45' High Cube",
            "buy-opt-new": "One Trip (New)",
            "buy-opt-used": "Cargo Worthy (Used)",
            "buy-opt-dry": "Dry Storage",
            "buy-opt-reefer": "Reefer (Climatizado)",
            "rent-h1": "Rent Your Container",
            "rent-btn-pricing": "Get Rental Quote",
            "trans-h1": "Transportation Quote",
            "trans-step1": "1. Container Size",
            "trans-step2": "2. Container Status",
            "trans-step3": "3. Crane Service",
            "trans-step4": "4. Route Details",
            "trans-opt-empty": "Empty",
            "trans-opt-full": "Full",
            "trans-opt-crane-yes": "Crane Needed",
            "trans-opt-crane-no": "No Crane Needed",
            "trans-zip-pickup": "Pickup Zip Code",
            "trans-zip-delivery": "Delivery Zip Code",
            "trans-btn-pricing": "Request Quote",
            "summary-status": "Status",
            "summary-crane": "Crane",
            "summary-route": "Route"
        },
        es: {
            "nav-home": "Inicio",
            "nav-services": "Servicios",
            "nav-about": "Nosotros",
            "nav-gallery": "Galería",
            "nav-contact": "Contacto",
            "hero-title": "Soluciones Modernas de Contenedores",
            "hero-p": "Logística global simplificada. Vendemos, alquilamos y transportamos contenedores de alta calidad adaptados a sus necesidades comerciales.",
            "hero-btn-services": "Nuestros Servicios",
            "hero-btn-quote": "Obtén una Cotización Instantánea.",
            "services-title": "Nuestros Servicios",
            "service-sales-h3": "Venta de Contenedores",
            "service-sales-p": "¿Buscas una solución permanente? Ofrecemos una amplia gama de contenedores de envío nuevos y usados para la venta.",
            "service-sales-btn": "Comprar",
            "service-rent-h3": "Alquiler de Contenedores",
            "service-rent-p": "Opciones de alquiler flexibles para necesidades de almacenamiento a corto y largo plazo. Contenedores fiables y seguros a su disposición.",
            "service-rent-btn": "Alquilar",
            "service-trans-h3": "Transporte",
            "service-trans-p": "Servicios de transporte rápidos y seguros. Entregamos sus contenedores a cualquier ubicación con precisión y cuidado.",
            "service-trans-btn": "Cotizar",
            "about-h2": "¿Por qué elegir RP Tulipan?",
            "about-p": "Con años de experiencia en la industria logística, nos enorgullecemos de brindar soluciones de contenedores de primer nivel. Nuestro compromiso con la calidad y la satisfacción del cliente nos convierte en líderes en el mercado.",
            "about-f1": "Contenedores de acero de alta calidad",
            "about-f2": "Precios competitivos de mercado",
            "about-f3": "Atención al cliente 24/7",
            "about-f4": "Red de entrega global",
            "contact-h2": "Contáctenos",
            "contact-h3": "Ponerse en contacto",
            "contact-p": "¿Tiene preguntas sobre nuestros servicios? Nuestro equipo está listo para ayudarlo a encontrar la solución de contenedor perfecta.",
            "contact-address": "9804 NW 80th Ave, Hialeah Gardens FL 33016, Estados Unidos",
            "form-name": "Tu nombre",
            "form-email": "Tu correo electrónico",
            "form-service-placeholder": "Seleccionar servicio",
            "form-service-sales": "Venta de contenedores",
            "form-service-rent": "Alquiler de contenedores",
            "form-service-trans": "Transporte",
            "form-message": "Tu mensaje",
            "form-btn": "Enviar mensaje",
            "footer-p": "Brindando excelencia en logística de contenedores.",
            "footer-links-h4": "Enlaces rápidos",
            "footer-social-h4": "Síguenos",
            "footer-bottom": "&copy; 2026 RP Tulipan Logistics. Todos los derechos reservados.",
            "gallery-h1": "Nuestra Galería de Fotos",
            "gallery-p": "Explore nuestros contenedores y operaciones logísticas",
            "buy-h1": "Configura tu Contenedor",
            "buy-p": "Selecciona las opciones que mejor se adapten a tus necesidades",
            "buy-step1": "1. Seleccionar Tamaño",
            "buy-step2": "2. Seleccionar Condición",
            "buy-step3": "3. Climatización",
            "buy-summary": "Resumen",
            "buy-btn-pricing": "Obtener Precios",
            "buy-btn-restart": "Reiniciar",
            "buy-back": "Atrás",
            "buy-back-home": "Volver a Servicios",
            "buy-opt-20": "20' Estándar",
            "buy-opt-40": "40' High Cube",
            "buy-opt-45": "45' High Cube",
            "buy-opt-new": "One Trip (Nuevo)",
            "buy-opt-used": "Cargo Worthy (Usado)",
            "buy-opt-dry": "Dry Storage",
            "buy-opt-reefer": "Reefer (Climatizado)",
            "rent-h1": "Alquila tu Contenedor",
            "rent-btn-pricing": "Obtener Cotización",
            "trans-h1": "Cotización de Transporte",
            "trans-step1": "1. Tamaño del Contenedor",
            "trans-step2": "2. Estado del Contenedor",
            "trans-step3": "3. Servicio de Grúa",
            "trans-step4": "4. Detalles de la Ruta",
            "trans-opt-empty": "Vacío",
            "trans-opt-full": "Lleno",
            "trans-opt-crane-yes": "Necesita Grúa",
            "trans-opt-crane-no": "No necesita Grúa",
            "trans-zip-pickup": "Zip Code de Recogida",
            "trans-zip-delivery": "Zip Code de Entrega",
            "trans-btn-pricing": "Solicitar Cotización",
            "summary-status": "Estado",
            "summary-crane": "Grúa",
            "summary-route": "Ruta"
        }
    };

    const updateLanguage = (lang) => {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) {
                if (el.querySelector('span')) {
                    const fullText = translations[lang][key];
                    el.innerHTML = fullText.replace('Solutions', `<span>Solutions</span>`)
                                           .replace('TULIPAN', `<span>TULIPAN</span>`)
                                           .replace('RP Tulipan?', `<span>RP Tulipan?</span>`)
                                           .replace('Photo Gallery', `<span>Photo Gallery</span>`)
                                           .replace('Container', `<span>Container</span>`);
                } else {
                    el.innerText = translations[lang][key];
                }
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (translations[lang][key]) {
                el.placeholder = translations[lang][key];
            }
        });

        if (galleryView.style.display === 'block') renderGallery();
        if (buyView.style.display === 'block') renderBuyView();
        if (rentView.style.display === 'block') renderRentView();
        if (transView.style.display === 'block') renderTransView();
    };

    if (langSwitch) {
        langSwitch.addEventListener('click', () => {
            currentLang = currentLang === 'en' ? 'es' : 'en';
            langSwitch.innerText = currentLang === 'en' ? 'ES' : 'EN';
            updateLanguage(currentLang);
        });
    }

    // SPA Navigation Logic
    const homeView = document.getElementById('home-view');
    const galleryView = document.getElementById('gallery-view');
    const buyView = document.getElementById('buy-view');
    const rentView = document.getElementById('rent-view');
    const transView = document.getElementById('trans-view');
    const navGallery = document.getElementById('nav-gallery');
    const footerGallery = document.querySelector('.footer-gallery');
    const btnBuyContainer = document.getElementById('btn-buy-container');
    const btnRentContainer = document.getElementById('btn-rent-container');
    const btnTransContainer = document.getElementById('btn-trans-container');
    const logoHome = document.querySelectorAll('.logo-home');
    const homeLinks = document.querySelectorAll('.nav-link');

    const showView = (viewName) => {
        homeView.style.display = viewName === 'home' ? 'block' : 'none';
        galleryView.style.display = viewName === 'gallery' ? 'block' : 'none';
        buyView.style.display = viewName === 'buy' ? 'block' : 'none';
        rentView.style.display = viewName === 'rent' ? 'block' : 'none';
        transView.style.display = viewName === 'trans' ? 'block' : 'none';

        if (viewName === 'gallery') renderGallery();
        if (viewName === 'buy') renderBuyView();
        if (viewName === 'rent') renderRentView();
        if (viewName === 'trans') renderTransView();

        window.scrollTo(0, 0);
        if (nav.classList.contains('nav-active')) {
            burger.click();
        }
    };

    navGallery.addEventListener('click', (e) => {
        e.preventDefault();
        showView('gallery');
    });

    if (footerGallery) {
        footerGallery.addEventListener('click', (e) => {
            e.preventDefault();
            showView('gallery');
        });
    }

    logoHome.forEach(logo => {
        logo.addEventListener('click', (e) => {
            e.preventDefault();
            showView('home');
        });
    });

    homeLinks.forEach(link => {
        link.addEventListener('click', () => {
            showView('home');
        });
    });

    if (btnBuyContainer) btnBuyContainer.addEventListener('click', (e) => { e.preventDefault(); showView('buy'); });
    if (btnRentContainer) btnRentContainer.addEventListener('click', (e) => { e.preventDefault(); showView('rent'); });
    if (btnTransContainer) btnTransContainer.addEventListener('click', (e) => { e.preventDefault(); showView('trans'); });

    // Reveal on Scroll
    const revealElements = document.querySelectorAll('.reveal');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('active');
        });
    }, { threshold: 0.1 });
    revealElements.forEach(el => revealObserver.observe(el));

    // Navbar Scroll Effect
    const mainNav = document.getElementById('main-nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            mainNav.style.padding = '10px 0';
            mainNav.style.backgroundColor = 'rgba(217, 4, 41, 0.95)';
        } else {
            mainNav.style.padding = '0';
            mainNav.style.backgroundColor = 'var(--primary-color)';
        }
    });

    // Form Submission Mock
    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const originalBtnText = contactForm.querySelector('button').innerText;
            contactForm.querySelector('button').innerText = currentLang === 'en' ? 'Message Sent!' : '¡Mensaje Enviado!';
            contactForm.querySelector('button').style.backgroundColor = '#2ecc71';
            setTimeout(() => {
                contactForm.reset();
                contactForm.querySelector('button').innerText = originalBtnText;
                contactForm.querySelector('button').style.backgroundColor = 'var(--primary-color)';
            }, 3000);
        });
    }

    function renderGallery() {
        const images = ['imgi_10_58-169x300.jpg', 'imgi_110_Diseno-sin-titulo-5-300x300.png', 'imgi_116_Diseno-sin-titulo-10-300x300.png', 'imgi_117_Diseno-sin-titulo-8-169x300.png', 'imgi_119_Diseno-sin-titulo-6-300x300.png', 'imgi_11_57-169x300.jpg', 'imgi_12_56-169x300.jpg', 'imgi_13_55-169x300.jpg', 'imgi_14_54-169x300.jpg', 'imgi_15_53-169x300.jpg', 'imgi_16_52-169x300.jpg', 'imgi_17_51-169x300.jpg', 'imgi_18_50-169x300.jpg', 'imgi_19_49-169x300.jpg', 'imgi_20_48-169x300.jpg', 'imgi_21_47-169x300.jpg', 'imgi_22_46-169x300.jpg', 'imgi_23_45-169x300.jpg', 'imgi_24_44-169x300.jpg', 'imgi_25_43-169x300.jpg', 'imgi_26_42-169x300.jpg', 'imgi_27_41-169x300.jpg', 'imgi_28_40-169x300.jpg', 'imgi_29_39-169x300.jpg', 'imgi_30_38-169x300.jpg', 'imgi_31_37-169x300.jpg', 'imgi_32_36-169x300.jpg', 'imgi_33_35-169x300.jpg', 'imgi_34_34-169x300.jpg', 'imgi_35_33-169x300.jpg', 'imgi_36_32-169x300.jpg', 'imgi_37_31-169x300.jpg', 'imgi_38_30-169x300.jpg', 'imgi_39_29-169x300.jpg', 'imgi_40_28-169x300.jpg', 'imgi_41_27-169x300.jpg', 'imgi_42_26-169x300.jpg', 'imgi_43_25-169x300.jpg', 'imgi_44_24-169x300.jpg', 'imgi_45_23-169x300.jpg', 'imgi_46_22-169x300.jpg', 'imgi_47_21-169x300.jpg', 'imgi_48_20-169x300.jpg', 'imgi_49_19-169x300.jpg', 'imgi_4_64-169x300.jpg', 'imgi_50_18-1-169x300.jpg', 'imgi_51_17-1-169x300.jpg', 'imgi_52_16-1-169x300.jpg', 'imgi_53_15-1-169x300.jpg', 'imgi_54_14-1-169x300.jpg', 'imgi_55_13-1-169x300.jpg', 'imgi_56_12-1-169x300.jpg', 'imgi_57_11-1-169x300.jpg', 'imgi_58_10-1-169x300.jpg', 'imgi_59_9-1-169x300.jpg', 'imgi_5_63-169x300.jpg', 'imgi_60_8-1-169x300.jpg', 'imgi_61_7-1-169x300.jpg', 'imgi_62_6-1-169x300.jpg', 'imgi_63_5-1-169x300.jpg', 'imgi_64_4-1-169x300.jpg', 'imgi_65_3-1-169x300.jpg', 'imgi_66_2-1-169x300.jpg', 'imgi_67_1-1-169x300.jpg', 'imgi_68_18-300x300.jpg', 'imgi_69_17-300x300.jpg', 'imgi_6_62-169x300.jpg', 'imgi_70_16-300x300.jpg', 'imgi_71_15-300x300.jpg', 'imgi_72_14-300x300.jpg', 'imgi_73_13-300x300.jpg', 'imgi_74_12-300x300.jpg', 'imgi_75_11-300x300.jpg', 'imgi_76_10-300x300.jpg', 'imgi_77_9-300x300.jpg', 'imgi_78_8-300x300.jpg', 'imgi_79_7-300x300.jpg', 'imgi_7_61-169x300.jpg', 'imgi_80_6-300x300.jpg', 'imgi_81_5-300x300.jpg', 'imgi_82_4-300x300.jpg', 'imgi_83_3-300x300.jpg', 'imgi_84_2-300x300.jpg', 'imgi_85_1-300x300.jpg', 'imgi_86_Diseno-sin-titulo-24-300x300.png', 'imgi_87_Diseno-sin-titulo-25-300x300.png', 'imgi_88_Diseno-sin-titulo-29-300x300.png', 'imgi_89_services-fullfill-300x185.jpg', 'imgi_8_60-169x300.jpg', 'imgi_90_services-finalmile-300x185.jpg', 'imgi_93_Diseno-sin-titulo-22-300x300.png', 'imgi_94_Diseno-sin-titulo-23-300x300.png', 'imgi_95_Diseno-sin-titulo-26-300x300.png', 'imgi_98_Diseno-sin-titulo-19-300x300.png', 'imgi_9_59-169x300.jpg'];
        const gridHTML = images.map(img => `<div class="gallery-item reveal active"><img src="assets/gallery/${img}" alt="Gallery Photo"></div>`).join('');
        const galleryView = document.getElementById('gallery-view');
        galleryView.innerHTML = `<header class="gallery-header"><div class="container"><h1 data-i18n="gallery-h1">${translations[currentLang]["gallery-h1"]}</h1><p data-i18n="gallery-p">${translations[currentLang]["gallery-p"]}</p></div></header><main class="container"><section class="gallery-grid">${gridHTML}</section></main>`;
        document.title = currentLang === 'en' ? "Photo Gallery | RP Tulipan Logistics" : "Galería de Fotos | RP Tulipan Logistics";
    }

    function renderConfigurationView(viewId, mode) {
        const viewEl = document.getElementById(viewId);
        const t = translations[currentLang];
        const h1 = mode === 'buy' ? t["buy-h1"] : t["rent-h1"];
        const btnPricing = mode === 'buy' ? t["buy-btn-pricing"] : t["rent-btn-pricing"];
        viewEl.innerHTML = `<header class="buy-header"><div class="container"><h1 data-i18n="${mode}-h1">${h1}</h1><p data-i18n="buy-p">${t["buy-p"]}</p></div></header><main class="container"><div class="buy-container"><div id="${mode}-steps"><div class="buy-step active" id="${mode}-step-size"><button class="btn-back back-btn-action"><i class="fas fa-arrow-left"></i> ${t["buy-back-home"]}</button><h3 data-i18n="buy-step1">${t["buy-step1"]}</h3><div class="options-grid"><div class="option-card" data-value="20'"><i class="fas fa-box"></i><span>${t["buy-opt-20"]}</span></div><div class="option-card" data-value="40'"><i class="fas fa-boxes"></i><span>${t["buy-opt-40"]}</span></div><div class="option-card" data-value="45'"><i class="fas fa-boxes"></i><span>${t["buy-opt-45"]}</span></div></div></div><div class="buy-step" id="${mode}-step-condition" style="display:none;"><button class="btn-back back-btn-action" data-prev="size"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button><h3 data-i18n="buy-step2">${t["buy-step2"]}</h3><div class="options-grid"><div class="option-card" data-value="NEW"><i class="fas fa-star"></i><span>${t["buy-opt-new"]}</span></div><div class="option-card" data-value="USED"><i class="fas fa-recycle"></i><span>${t["buy-opt-used"]}</span></div></div></div><div class="buy-step" id="${mode}-step-type" style="display:none;"><button class="btn-back back-btn-action" data-prev="condition"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button><h3 data-i18n="buy-step3">${t["buy-step3"]}</h3><div class="options-grid"><div class="option-card" data-value="Dry"><i class="fas fa-wind"></i><span>${t["buy-opt-dry"]}</span></div><div class="option-card" data-value="Reefer"><i class="fas fa-snowflake"></i><span>${t["buy-opt-reefer"]}</span></div></div></div></div><div id="${mode}-summary" style="display:none;" class="summary-view"><button class="btn-back back-btn-action" data-prev="type"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button><h3 data-i18n="buy-summary">${t["buy-summary"]}</h3><div class="summary-details"><p><strong>Size:</strong> <span class="summary-size">-</span></p><p><strong>Condition:</strong> <span class="summary-condition">-</span></p><p><strong>Type:</strong> <span class="summary-type">-</span></p></div><div style="display: flex; gap: 10px; margin-top: 20px;"><button class="btn btn-primary btn-get-pricing" style="flex: 1;" data-i18n="${mode}-btn-pricing">${btnPricing}</button><button class="btn btn-outline btn-restart-action" style="flex: 1; color: var(--primary-color); border-color: var(--primary-color);" data-i18n="buy-btn-restart">${t["buy-btn-restart"]}</button></div></div></div></main>`;
        const selections = { size: null, condition: null, type: null };
        const steps = ['size', 'condition', 'type'];
        let currentIndex = 0;
        viewEl.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', () => {
                const stepId = card.closest('.buy-step').id.split('-').pop();
                selections[stepId] = card.dataset.value;
                card.parentNode.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                setTimeout(() => {
                    viewEl.querySelector(`#${mode}-step-${stepId}`).style.display = 'none';
                    currentIndex++;
                    if (currentIndex < steps.length) {
                        const nextStep = steps[currentIndex];
                        const nextEl = viewEl.querySelector(`#${mode}-step-${nextStep}`);
                        nextEl.style.display = 'block';
                        nextEl.classList.add('fade-in');
                    } else {
                        viewEl.querySelector('.summary-size').textContent = selections.size;
                        viewEl.querySelector('.summary-condition').textContent = selections.condition;
                        viewEl.querySelector('.summary-type').textContent = selections.type;
                        viewEl.querySelector('.summary-view').style.display = 'block';
                        viewEl.querySelector('.summary-view').classList.add('fade-in');
                    }
                }, 400);
            });
        });
        viewEl.querySelectorAll('.back-btn-action').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!btn.dataset.prev) { showView('home'); return; }
                const prevStep = btn.dataset.prev;
                const currentStepEl = btn.closest('.buy-step') || viewEl.querySelector('.summary-view');
                currentStepEl.style.display = 'none';
                const prevEl = viewEl.querySelector(`#${mode}-step-${prevStep}`);
                prevEl.style.display = 'block';
                prevEl.classList.add('fade-in');
                currentIndex = steps.indexOf(prevStep);
            });
        });
        viewEl.querySelector('.btn-restart-action').addEventListener('click', () => renderConfigurationView(viewId, mode));
        document.title = (mode === 'buy' ? t["service-sales-h3"] : t["service-rent-h3"]) + " | RP Tulipan Logistics";
    }

    function renderTransView() {
        const transView = document.getElementById('trans-view');
        const t = translations[currentLang];
        transView.innerHTML = `
            <header class="buy-header">
                <div class="container">
                    <h1 data-i18n="trans-h1">${t["trans-h1"]}</h1>
                    <p data-i18n="buy-p">${t["buy-p"]}</p>
                </div>
            </header>
            <main class="container">
                <div class="buy-container">
                    <div id="trans-steps">
                        <!-- Step 1: Size -->
                        <div class="buy-step active" id="trans-step-size">
                            <button class="btn-back back-btn-action"><i class="fas fa-arrow-left"></i> ${t["buy-back-home"]}</button>
                            <h3 data-i18n="trans-step1">${t["trans-step1"]}</h3>
                            <div class="options-grid">
                                <div class="option-card" data-value="20'"><i class="fas fa-box"></i><span>${t["buy-opt-20"]}</span></div>
                                <div class="option-card" data-value="40'"><i class="fas fa-boxes"></i><span>${t["buy-opt-40"]}</span></div>
                                <div class="option-card" data-value="45'"><i class="fas fa-boxes"></i><span>${t["buy-opt-45"]}</span></div>
                            </div>
                        </div>
                        <!-- Step 2: Status -->
                        <div class="buy-step" id="trans-step-status" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="size"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="trans-step2">${t["trans-step2"]}</h3>
                            <div class="options-grid">
                                <div class="option-card" data-value="Empty"><i class="fas fa-cube"></i><span>${t["trans-opt-empty"]}</span></div>
                                <div class="option-card" data-value="Full"><i class="fas fa-cubes"></i><span>${t["trans-opt-full"]}</span></div>
                            </div>
                        </div>
                        <!-- Step 3: Crane -->
                        <div class="buy-step" id="trans-step-crane" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="status"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="trans-step3">${t["trans-step3"]}</h3>
                            <div class="options-grid">
                                <div class="option-card" data-value="Yes"><i class="fas fa-truck-pickup"></i><span>${t["trans-opt-crane-yes"]}</span></div>
                                <div class="option-card" data-value="No"><i class="fas fa-truck"></i><span>${t["trans-opt-crane-no"]}</span></div>
                            </div>
                        </div>
                        <!-- Step 4: Zip Codes -->
                        <div class="buy-step" id="trans-step-route" style="display:none;">
                            <button class="btn-back back-btn-action" data-prev="crane"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                            <h3 data-i18n="trans-step4">${t["trans-step4"]}</h3>
                            <div class="form-group" style="margin-top: 20px;">
                                <input type="text" id="zip-pickup" placeholder="${t["trans-zip-pickup"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 15px;">
                                <input type="text" id="zip-delivery" placeholder="${t["trans-zip-delivery"]}" class="form-input" style="width: 100%; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
                                <button class="btn btn-primary" id="btn-submit-route" style="width: 100%; margin-top: 20px;">Next</button>
                            </div>
                        </div>
                    </div>
                    <div id="trans-summary" style="display:none;" class="summary-view">
                        <button class="btn-back back-btn-action" data-prev="route"><i class="fas fa-arrow-left"></i> ${t["buy-back"]}</button>
                        <h3 data-i18n="buy-summary">${t["buy-summary"]}</h3>
                        <div class="summary-details">
                            <p><strong>Size:</strong> <span class="summary-size">-</span></p>
                            <p><strong>${t["summary-status"]}:</strong> <span class="summary-status">-</span></p>
                            <p><strong>${t["summary-crane"]}:</strong> <span class="summary-crane">-</span></p>
                            <p><strong>${t["summary-route"]}:</strong> <span class="summary-route">-</span></p>
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 20px;">
                            <button class="btn btn-primary" style="flex: 1;" data-i18n="trans-btn-pricing">${t["trans-btn-pricing"]}</button>
                            <button class="btn btn-outline btn-restart-action" style="flex: 1; color: var(--primary-color); border-color: var(--primary-color);" data-i18n="buy-btn-restart">${t["buy-btn-restart"]}</button>
                        </div>
                    </div>
                </div>
            </main>
        `;

        const selections = { size: null, status: null, crane: null, pickup: '', delivery: '' };
        const steps = ['size', 'status', 'crane', 'route'];
        let currentIndex = 0;

        transView.querySelectorAll('.option-card').forEach(card => {
            card.addEventListener('click', () => {
                const stepId = card.closest('.buy-step').id.split('-').pop();
                selections[stepId] = card.dataset.value;
                card.parentNode.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                setTimeout(() => {
                    transView.querySelector(`#trans-step-${stepId}`).style.display = 'none';
                    currentIndex++;
                    const nextStep = steps[currentIndex];
                    const nextEl = transView.querySelector(`#trans-step-${nextStep}`);
                    nextEl.style.display = 'block';
                    nextEl.classList.add('fade-in');
                }, 400);
            });
        });

        transView.querySelector('#btn-submit-route').addEventListener('click', () => {
            selections.pickup = transView.querySelector('#zip-pickup').value;
            selections.delivery = transView.querySelector('#zip-delivery').value;
            if (!selections.pickup || !selections.delivery) {
                alert(currentLang === 'en' ? 'Please enter both zip codes' : 'Por favor ingrese ambos códigos postales');
                return;
            }
            transView.querySelector('#trans-step-route').style.display = 'none';
            transView.querySelector('.summary-size').textContent = selections.size;
            transView.querySelector('.summary-status').textContent = selections.status;
            transView.querySelector('.summary-crane').textContent = selections.crane;
            transView.querySelector('.summary-route').textContent = `${selections.pickup} ➔ ${selections.delivery}`;
            transView.querySelector('#trans-summary').style.display = 'block';
            transView.querySelector('#trans-summary').classList.add('fade-in');
        });

        transView.querySelectorAll('.back-btn-action').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!btn.dataset.prev) { showView('home'); return; }
                const prevStep = btn.dataset.prev;
                const currentStepEl = btn.closest('.buy-step') || transView.querySelector('#trans-summary');
                currentStepEl.style.display = 'none';
                const prevEl = transView.querySelector(`#trans-step-${prevStep}`);
                prevEl.style.display = 'block';
                prevEl.classList.add('fade-in');
                currentIndex = steps.indexOf(prevStep);
            });
        });

        transView.querySelector('.btn-restart-action').addEventListener('click', () => renderTransView());
        document.title = t["service-trans-h3"] + " | RP Tulipan Logistics";
    }

    function renderBuyView() { renderConfigurationView('buy-view', 'buy'); }
    function renderRentView() { renderConfigurationView('rent-view', 'rent'); }
});
