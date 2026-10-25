/* Website billing account: sign in, create account, and read-only summary. */
(function () {
  'use strict';

  var API = String(window.BILLING_API_URL || '').replace(/\/+$/, '');
  var $ = function (id) { return document.getElementById(id); };

  function showMessage(message, isError) {
    var box = $('account-error');
    if (!box) return;
    box.textContent = message || '';
    box.classList.toggle('is-visible', Boolean(message));
    box.classList.toggle('is-success', Boolean(message) && !isError);
  }

  function showError(message) {
    showMessage(message, true);
  }

  function showNotice(message) {
    showMessage(message, false);
  }

  function request(path, options) {
    var opts = options || {};
    opts.credentials = 'include';
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    return fetch(API + path, opts).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var detail = data && data.detail;
          var error = new Error(typeof detail === 'string' ? detail : 'Request failed.');
          error.status = response.status;
          throw error;
        }
        return data;
      });
    });
  }

  function formatDate(value) {
    if (!value) return 'No expiry';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }

  function formatAmount(purchase) {
    var amount = Number(purchase.amount);
    if (!Number.isFinite(amount)) return '—';
    var currency = String(purchase.currency || 'INR').toUpperCase();
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency', currency: currency, maximumFractionDigits: 2
      }).format(amount / 100);
    } catch (err) {
      return currency + ' ' + (amount / 100).toFixed(2);
    }
  }

  function setText(id, value) {
    var node = $(id);
    if (node) node.textContent = value;
  }

  function setHidden(id, hidden) {
    var node = $(id);
    if (node) node.classList.toggle('account-hidden', Boolean(hidden));
  }

  function showAuth() {
    $('account-loading').classList.add('account-hidden');
    $('account-panel').classList.add('account-hidden');
    $('account-auth').classList.remove('account-hidden');
  }

  function showPanel(summary) {
    $('account-loading').classList.add('account-hidden');
    $('account-auth').classList.add('account-hidden');
    $('account-panel').classList.remove('account-hidden');

    var email = summary.user && summary.user.email ? summary.user.email : '';
    setText('account-email', email);
    setText('account-verify-email', email);

    if (summary.email_verified === false) {
      setHidden('account-verify', false);
      setHidden('account-plan-card', true);
      setHidden('account-purchases-card', true);
      return;
    }

    setHidden('account-verify', true);
    setHidden('account-plan-card', false);
    setHidden('account-purchases-card', false);

    var plan = String(summary.plan || 'free');
    setText('account-plan', plan === 'free' ? 'Free' : plan);
    setText('account-plan-name', plan === 'free' ? 'Free' : plan);
    setText('account-status', summary.status || 'free');
    setText('account-expiry', formatDate(summary.expires_at));
    setText('account-renew',
      summary.auto_renew === true ? 'Yes' :
      summary.auto_renew === false ? 'No, ends after this period' : 'Not applicable');

    var host = $('account-purchases');
    host.textContent = '';
    var purchases = Array.isArray(summary.purchases) ? summary.purchases : [];
    if (!purchases.length) {
      var empty = document.createElement('div');
      empty.className = 'account-empty';
      empty.textContent = 'No purchases yet. The free tier needs no card.';
      host.appendChild(empty);
      return;
    }

    var table = document.createElement('table');
    table.className = 'account-purchases';
    var head = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['Date', 'Plan', 'Amount', 'Status'].forEach(function (label) {
      var th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    table.appendChild(head);

    var body = document.createElement('tbody');
    purchases.forEach(function (purchase) {
      var row = document.createElement('tr');
      [
        formatDate(purchase.paid_at || purchase.created_at),
        String(purchase.plan || '—'),
        formatAmount(purchase),
        String(purchase.status || '—')
      ].forEach(function (value) {
        var cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
    table.appendChild(body);
    host.appendChild(table);
  }

  function loadSummary(notice) {
    showError('');
    return request('/v1/accounts/me', { method: 'GET' })
      .then(function () { return request('/v1/accounts/summary', { method: 'GET' }); })
      .then(function (summary) {
        showPanel(summary);
        if (notice) showNotice(notice);
        return summary;
      })
      .catch(function (error) {
        showAuth();
        if (error.status === 401) {
          if (notice) showNotice(notice);
          return;
        }
        showError(error.message || 'Could not load your account.');
      });
  }

  function consumeVerificationLink() {
    var match = /(?:^|[#&])verify=([^&]+)/.exec(window.location.hash || '');
    if (!match) return Promise.resolve({});
    var token = '';
    try {
      token = decodeURIComponent(match[1]);
    } catch (err) {
      token = '';
    }
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch (err) { /* the token still works even if the URL cannot be rewritten */ }
    if (!token) return Promise.resolve({ error: 'The verification link is incomplete.' });
    return request('/v1/accounts/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token: token })
    }).then(function () {
      return { notice: 'Email verified. Your plan and purchases are now visible.' };
    }).catch(function (error) {
      return { error: error.message || 'Could not verify this email link.' };
    });
  }

  function selectTab(which) {
    var login = which === 'login';
    $('tab-login').setAttribute('aria-selected', login ? 'true' : 'false');
    $('tab-register').setAttribute('aria-selected', login ? 'false' : 'true');
    $('login-form').classList.toggle('account-hidden', !login);
    $('register-form').classList.toggle('account-hidden', login);
    $('auth-heading').textContent = login ? 'Sign in' : 'Create account';
    showError('');
  }

  function buttonBusy(button, busy, label) {
    if (!button) return;
    button.disabled = busy;
    if (busy) {
      button.dataset.label = button.textContent;
      button.textContent = label;
    } else if (button.dataset.label) {
      button.textContent = button.dataset.label;
      delete button.dataset.label;
    }
  }

  function bindForms() {
    var loginForm = $('login-form');
    var registerForm = $('register-form');

    $('tab-login').addEventListener('click', function () { selectTab('login'); });
    $('tab-register').addEventListener('click', function () { selectTab('register'); });

    loginForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var button = loginForm.querySelector('button[type="submit"]');
      showError('');
      buttonBusy(button, true, 'Signing in…');
      request('/v1/accounts/login', {
        method: 'POST',
        body: JSON.stringify({
          email: $('login-email').value.trim(),
          password: $('login-password').value
        })
      }).then(function () {
        loginForm.reset();
        return loadSummary();
      }).catch(function (error) {
        showError(error.message || 'Could not sign in.');
      }).then(function () {
        buttonBusy(button, false);
      });
    });

    registerForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var password = $('register-password').value;
      if (password !== $('register-confirm').value) {
        showError('Passwords do not match.');
        return;
      }
      var button = registerForm.querySelector('button[type="submit"]');
      showError('');
      buttonBusy(button, true, 'Creating account…');
      request('/v1/accounts/register', {
        method: 'POST',
        body: JSON.stringify({
          email: $('register-email').value.trim(),
          password: password
        })
      }).then(function (data) {
        registerForm.reset();
        var notice = data.verification_sent
          ? 'Account created. Check your email and open the confirmation link.'
          : 'Account created, but the verification email could not be sent. Try Resend below or contact support.';
        return loadSummary(notice);
      }).catch(function (error) {
        showError(error.message || 'Could not create the account.');
      }).then(function () {
        buttonBusy(button, false);
      });
    });

    $('account-resend').addEventListener('click', function () {
      var button = $('account-resend');
      buttonBusy(button, true, 'Sending...');
      request('/v1/accounts/resend-verification', { method: 'POST' })
        .then(function (data) {
          if (data.already_verified) {
            return loadSummary('Email already verified.');
          }
          if (data.verification_sent) {
            showNotice('Verification email sent. Only the newest link works.');
            return;
          }
          showError('Could not send the verification email. Try again later or contact support.');
        })
        .catch(function (error) {
          if (error.status === 401) {
            showAuth();
            return;
          }
          showError(error.message || 'Could not send the verification email.');
        })
        .then(function () {
          buttonBusy(button, false);
        });
    });

    ['account-logout', 'account-logout-unverified'].forEach(function (id) {
      var button = $(id);
      if (!button) return;
      button.addEventListener('click', function () {
        buttonBusy(button, true, 'Signing out...');
        request('/v1/accounts/logout', { method: 'POST' })
          .catch(function () { /* the cookie is cleared server-side on success */ })
          .then(function () {
            buttonBusy(button, false);
            $('account-purchases').textContent = '';
            showAuth();
          });
      });
    });
  }

  function startFromVerificationLink() {
    consumeVerificationLink().then(function (result) {
      return loadSummary(result.notice).then(function () {
        if (result.error) showError(result.error);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!API) {
      showAuth();
      showError('Billing is not configured on this deployment.');
      return;
    }
    bindForms();
    window.addEventListener('hashchange', startFromVerificationLink);
    startFromVerificationLink();
  });
})();
