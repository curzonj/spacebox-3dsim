(function() {
    'use strict';

    var appHUD = angular.module('spaceboxHUD', ['ngRoute']);

    appHUD.config(function($routeProvider) {
        $routeProvider

            .when('/', {
                templateUrl : 'ang/home.html',
                controller  : 'mainController'
            })

            .when('/testmeForm', {
                templateUrl : 'ang/home.html',
                controller  : 'mainController'
            });
    });

    // create the controller and inject Angular's $scope
    appHUD.controller('mainController', function($scope) {

        // create a message to display in our view
        $scope.message = 'Everyone come and see how good I look!';
        $scope.testMe = function() {
            console.log("testing");
        };
    });

})();
